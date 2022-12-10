module.exports = function (router: any) {
  
  router.get('/token/categorized/qoute/info', asyncMiddleware(async (req: any, res: any) => {

    if (!req.query.sourceTokenContractAddress || !req.query.sourceNetworkChainId 
      || !req.query.sourceAmount || !req.query.destinationTokenContractAddress
      || !req.query.destinationNetworkChainId ) {
      return res.http401('sourceTokenContractAddress & sourceNetworkChainId & sourceAmount & destinationTokenContractAddress & destinationNetworkChainId are missing');
    }

    return res.http200({
      data: await multiSwapHelper.getTokenCategorizedInformation(req)
     });

  }));

  router.get('/swap/signed', asyncMiddleware(async (req: any, res: any) => {

    if (!req.query.walletAddress || !req.query.sourceTokenContractAddress || !req.query.sourceNetworkChainId 
      || !req.query.sourceAmount || !req.query.destinationTokenContractAddress
      || !req.query.destinationNetworkChainId ) {
      return res.http401('sourceTokenContractAddress & sourceNetworkChainId & sourceAmount & destinationTokenContractAddress & destinationNetworkChainId are missing');
    }

    req.query.walletAddress = (req.query.walletAddress).toLowerCase();

    return res.http200({
      data: await multiSwapHelper.getSwapSigned(req)
    });

  }));

  router.get('/withdraw/signed', asyncMiddleware(async (req: any, res: any) => {

    if (!req.query.walletAddress || !req.query.sourceTokenContractAddress || !req.query.sourceNetworkChainId 
      || !req.query.sourceAmount || !req.query.destinationTokenContractAddress
      || !req.query.destinationNetworkChainId || !req.query.transactionHash) {
      return res.http401('sourceTokenContractAddress & sourceNetworkChainId & sourceAmount & destinationTokenContractAddress & destinationNetworkChainId & transactionHash are missing');
    }

    return res.http200({
      data: await multiSwapHelper.getWithdrawSigned(req)
    });

  }));

};
