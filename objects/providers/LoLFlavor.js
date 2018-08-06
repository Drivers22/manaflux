const rp = require('request-promise-native');
const { ItemSet, Block } = require('../ItemSet');

class LoLFlavorProvider {
  constructor() {
    this.base = 'http://lolflavor.com/champions/';
    this.name = 'LoLFlavor';
  }

  async getItemSets(champion, position, gameMode) {
    position = 'middle';

    try {
      if (!position || position === gameMode) throw TypeError("Can't find itemsets without position");
      if (position === 'middle') position = 'mid';

      const res = await rp({
        method: 'GET',
        uri: `${this.base}${champion.key}/Recommended/${champion.key}_${gameMode === 'ARAM' ? 'aram' : position}_scrape.json`,
        json: true
      });

      return this._aggregate(res, champion, position, gameMode);
    }
    catch(err) {
      UI.error('Couldn\'t find item sets using LoLFlavor Provider');
      if (err.statusCode === 404) return { itemsets: [] };
      else console.error(err);
    }
  }

  async _aggregate(itemset, champion, position, gameMode) {
    position = position.charAt(0).toUpperCase() + position.slice(1);

    itemset.blocks[0].type = 'Consommables | set mis-à-jour le ' + itemset.title.split(' - ')[1];
    itemset.title = `${champion.name} ${gameMode === 'ARAM' ? 'ARAM' : position} (LoLFlavor)`;

    return { itemsets: [itemset] };
  }
}

module.exports = LoLFlavorProvider;