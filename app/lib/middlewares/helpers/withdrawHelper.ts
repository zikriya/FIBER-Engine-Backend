var Web3= require("web3");
const abiDecoder = require('abi-decoder'); // NodeJS

module.exports = {

  getWithdrawReqObject: async function (req: any) {
    let data: any = {};
    try{
      let sourceNetwork = commonFunctions.getNetworkByChainId(req.query.sourceNetworkChainId);
      if (sourceNetwork) {
        console.log('sourceNetwork', sourceNetwork.name);
        let receipt = await receiptsHelper.getReceiptBySwapHash(req.query.swapTransactionHash, sourceNetwork._id);
        if(receipt){
          let web3 = web3ConfigurationHelper.web3(sourceNetwork.rpcUrl).eth;
          let transaction = await web3.getTransaction(req.query.swapTransactionHash);
          if (transaction) {
            data.sourceAmount = await this.getValueFromWebTransaction(transaction, 'amountIn');
            if(!data.sourceAmount){
              data.sourceAmount = await this.getValueFromWebTransaction(transaction, 'amount');
            }
            data.sourceWalletAddress = transaction.from;
            data.destinationWalletAddress = await this.getValueFromWebTransaction(transaction, 'targetAddress');
            if(data.sourceWalletAddress){
              data.sourceWalletAddress = (data.sourceWalletAddress).toLowerCase();
            }
            if(data.destinationWalletAddress){
              data.destinationWalletAddress = (data.destinationWalletAddress).toLowerCase();
            }
            data.sourceTokenContractAddress = await this.getValueFromWebTransaction(transaction, 'token');
            data.destinationTokenContractAddress = await this.getValueFromWebTransaction(transaction, 'targetToken');
            data.sourceNetworkChainId = sourceNetwork.chainId;
            data.destinationNetworkChainId = await this.getValueFromWebTransaction(transaction, 'targetNetwork');
            if(data.sourceAmount){
              data.sourceAmount = await commonFunctions.amountToHuman(sourceNetwork.multiswapNetworkFIBERInformation.rpcUrl, data.sourceTokenContractAddress, data.sourceAmount);
            }
            console.log('swap req data object',data);
          }
        }        
      }
    }catch(e){
      console.log('error',e)
    }

    return data;
  },

  getValueFromWebTransaction: async function (transaction: any, paramName: any) {
    let amount = null;
    if(transaction){
      abiDecoder.addABI(web3ConfigurationHelper.getfiberAbi());
      const decodedData = await abiDecoder.decodeMethod(transaction.input);
      console.log(decodedData);
      if(decodedData && decodedData.params && decodedData.params.length > 0){
        for(let item of decodedData.params||[]){
          console.log(item.name);
          if(item && item.name == paramName){
            if(item.value){
              return item.value;
            }

          }
        }
      }
    }
    return amount;
  }

}
