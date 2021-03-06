const rp = require('request-promise-native'), cheerio = require('cheerio');
const { ItemSet, Block } = require('../ItemSet');
const Provider = require('./Provider');

class LeagueofGraphsProvider extends Provider {
  constructor() {
    super('leagueofgraphs', 'League of Graphs');

    this.base = 'https://www.leagueofgraphs.com/champions';
  }

  async getData(champion, preferredPosition, gameMode) {
    let data = { roles: {} };

    if (gameMode === 'ARAM') {
      try {
        console.log(2, `[ProviderHandler] [LOG] Gathering data (ARAM)`);
        data.roles.ARAM = await this._scrape(champion, preferredPosition, gameMode);
      }
      catch(err) {
        console.log(`[ProviderHandler] [League of Graphs] Something happened while gathering data (ARAM)`);
        console.error(err);
      }
    }
    else {
      for (let x of ['JUNGLE', 'MIDDLE', 'TOP', 'ADC', 'SUPPORT']) {
        console.log(2, `[ProviderHandler] [League of Graphs] Gathering data (${x})`);

        try {
          data.roles[x] = await this._scrape(champion, x, gameMode);
        }
        catch(err) {
          console.log(`[ProviderHandler] [League of Graphs] Something happened while gathering data (${x})`);
          console.error(err);
        }
      }
    }

    return data;
  }

  async _scrape(champion, position, gameMode) {
    const data = await Promise.all([
      rp({ uri: `${this.base}/runes/${champion.key}${position ? '/' + position : ''}`.toLowerCase(), transform: body => cheerio.load(body) }),
      Mana.getStore().get('item-sets-enable') ? rp({ uri: `${this.base}/items/${champion.key}${position ? '/' + position : ''}`.toLowerCase(), transform: body => cheerio.load(body) }) : Promise.resolve(),
      Mana.getStore().get('summoner-spells') ? rp({ uri: `${this.base}/spells/${champion.key}${position ? '/' + position : ''}`.toLowerCase(), transform: body => cheerio.load(body) }) : Promise.resolve(),
      Mana.getStore().get('statistics') && false ? rp({ uri: `${this.base}/stats/${champion.key}${position ? '/' + position : ''}`.toLowerCase(), transform: body => cheerio.load(body) }) : Promise.resolve(),
      rp({ uri: `${this.base}/skills-orders/${champion.key}${position ? '/' + position : ''}`.toLowerCase(), transform: body => cheerio.load(body) })
    ]);

    const perks = this.scrapePerks(data[0]);

    const itemsets = Mana.getStore().get('item-sets-enable') ? this.scrapeItemSets(data[1], champion, position, this.scrapeSkillOrder(data[data.length - 1])) : [];
    const summonerspells = Mana.getStore().get('summoner-spells') ? this.scrapeSummonerSpells(data[2], champion) : [];
    const statistics = Mana.getStore().get('statistics') ? {} : {};

    return { perks, itemsets, summonerspells, statistics, gameMode };
  }

  /**
   * Scrapes item sets from a League of Graphs page
   * @param {cheerio} $ - The cheerio object
   */
  scrapePerks($) {
    let pages = [{ selectedPerkIds: [] }, { selectedPerkIds: [] }];

    for (let page in pages) {
      $('table').eq(page).find('tr').each(function(index) {
        /* Perks styles */
        if (index === 0) {
          $(this).find("img[src^='//cdn.leagueofgraphs.com/img/perks/']").each(function(index) {
            pages[page][index === 0 ? 'primaryStyleId' : 'subStyleId'] = parseInt($(this).attr('src').slice(-8, -4));
          });
          return;
        }

        const perks = $(this).find("img[src^='//cdn.leagueofgraphs.com/img/perks/']").toArray().sort((a, b) => parseFloat($(a).css('opacity')) - parseFloat($(b).css('opacity')));

        if (4 < index && index < 7) {
          if (perks.every(x => parseFloat(x.attribs.style.slice(x.attribs.style.lastIndexOf(' ') + 1)) > 0.5))
            pages[page].selectedPerkIds.push(parseInt(perks[perks.length - 1].attribs.src.slice(-8, -4)));
        }
        else pages[page].selectedPerkIds.push(parseInt(perks[perks.length - 1].attribs.src.slice(-8, -4)));
      });
    }

    return pages;
  }

  /**
   * Scrapes summoner spells from a League of Graphs page
   * @param {cheerio} $ - The cheerio object
   */
  scrapeSummonerSpells($) {
    if (Mana.gameClient.locale !== 'en_GB' && Mana.gameClient.locale !== 'en_US') return console.log(2, `[ProviderHandler] [League of Graphs] Summoner spells are not supported because you're not using the english language in League`);

    let summoners = [];
    $('table').find('td > span').each(function(index) {
      summoners.push($(this).text().trim().split(' - ').map(y => Object.values(Mana.summonerspells).find(z => z.name === y)));
    });

    return summoners;
  }

  /**
   * Scrapes skill order from a League of Graphs page
   * @param {cheerio} $ - The cheerio object
   */
  scrapeSkillOrder($) {
    let x = [[0, 0, 0, 'Q'], [0, 0, 0, 'W'], [0, 0, 0, 'E']], keys = ['Q', 'W', 'E', 'R'];
    $('.skillCell').each(function(index) {
      if ($(this).hasClass('active')) x[Math.floor(index / 18)][Math.floor(index % 18 / 6)]++;

      /* 18 * 3 = Total number of skills */
      if (index === 54) return false;
    });

    return x.map((x, index) => i18n.__('key-' + keys[index])).sort((a, b) => a[0] - b[0] || a[1] - b[1]).join(' => ');
  }

  /**
   * Scrapes item sets from a League of Graphs page
   * @param {cheerio} $ - The cheerio object
   * @param {object} champion - A champion object, from Mana.champions
   * @param {string} position - Limited to: TOP, JUNGLE, MIDDLE, ADC, SUPPORT
   * @param {object} skillorder
   */
  scrapeItemSets($, champion, position, skillorder) {
    let itemset = new ItemSet(champion.key, position, this.id).setTitle(`LOG ${champion.name} - ${position}`);
    let starters = [], blocks = [
        new Block().setType({ i18n: 'item-sets-block-core-build-wr' }),
        new Block().setType({ i18n: 'item-sets-block-endgame' }),
        new Block().setType({ i18n: 'item-sets-block-boots' })
    ];

    $('#mainContent > div > div > div > table').each(function(index) {
      if (index === 0) {
        $(this).find('tr').each(function(index) {
          if ($(this).find('img').length === 0) return true;
          let block = new Block().setType({ i18n: 'item-sets-block-starter-wr-skill-order-numbered', arguments: [index + 1, $(this).find('div > .percentage').eq(5).text(), skillorder] });

          $(this).find('img').each(function() {
            block.addItem($(this).attr('class').slice(20, -4), false);
          });

          starters.push(block);
        });
      }
      else if (blocks[index]) {
        $(this).find('img').each(function() {
          blocks[index].addItem($(this).attr('class').slice(20, -4), false);
        });
      }
    });

    itemset.setBlocks(starters.slice(0, Mana.getStore().get('item-sets-max-starters', 3)));
    itemset.addBlock(new Block().setType({ i18n: 'item-sets-block-trinkets' }).addItem(2055).addItem(3340).addItem(3341).addItem(3348).addItem(3363));
    itemset.addBlocks(...blocks);
    itemset.addBlock(new Block().setType({ i18n: 'item-sets-block-consumables' }).addItem(2003).addItem(2138).addItem(2139).addItem(2140));
    return [itemset];
  }

  getCondensedName() {
    return 'LOG';
  }
}

module.exports = LeagueofGraphsProvider;
