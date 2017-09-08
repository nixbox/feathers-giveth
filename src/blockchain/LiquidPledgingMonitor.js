import Managers from './Managers';
import createModel from '../models/blockchain.model';


// Storing this in the db ensures that we don't miss any events on a restart
const defaultConfig = {
  lastBlock: 0,
};

export default class {
  constructor(app, liquidPledging) {
    this.app = app;
    // this.web3 = liquidPledging.$web3;
    this.contract = liquidPledging.$contract;
    this.liquidPledging = liquidPledging;
    this.managers = new Managers(app, liquidPledging);
    this.model = createModel(app);
  }

  /**
   * start monitoring contract events
   */
  start() {
    // starts listening to all events emitted by liquidPledging and delegates to the appropriate class
    this._getConfig()
      .then(config => this.config = config)
      .then(() => this._startListeners());
  }

  /**
   * start listenting to allEvents on the contract
   * @private
   */
  _startListeners() {
    this.contract.events.allEvents({ fromBlock: this.config.lastBlock })
      .on('data', this._handleEvent.bind(this))
      .on('changed', (event) => {
        // I think this is emitted when a chain reorg happens and the tx has been removed
        console.log('changed: ', event); // eslint-disable-line no-console
        this.liquidPledging.getState()
          .then(state => {
            console.log('liquidPledging state at changed event: ', JSON.stringify(state, null, 2)); //eslint-disable-line no-console
          });
      })
      // TODO if the connection dropped, do we need to try and reconnect?
      .on('error', err => console.error('error: ', err));
  }

  /**
   * get config from database
   *
   * @return {Promise}
   * @private
   */
  _getConfig() {
    return new Promise((resolve, reject) => {
      this.model.findOne({ _id: 0 }, (err, doc) => {
        if (err) return reject(err);

        if (!doc) return resolve(defaultConfig);

        resolve(doc);
      });
    });
  }

  /**
   * update the config if needed
   *
   * @param blockNumber
   * @private
   */
  _updateConfig(blockNumber) {
    if (this.config.lastBlock < blockNumber) {
      this.config.lastBlock = blockNumber;

      this.model.update({ _id: 0 }, this.config, { upsert: true }, console.error); // eslint-disable-line no-console
    }
  }

  _handleEvent(event) {
    this._updateConfig(event.blockNumber);

    console.log('handlingEvent: ', event);

    switch (event.event) {
      case 'DonorAdded':
        this.managers.addDonor(event);
        break;
      default:
        console.error('Unknown event: ', event); //eslint-disable-line no-console
    }
  }
}