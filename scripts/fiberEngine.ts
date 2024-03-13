var { ethers } = require("ethers");
var Web3 = require("web3");
require("dotenv").config();
const fundManagerAbi = require("../artifacts/contracts/upgradeable-Bridge/FundManager.sol/FundManager.json");
const fiberRouterAbi = require("../artifacts/contracts/upgradeable-Bridge/FiberRouter.sol/FiberRouter.json");
var tokenAbi = require("../artifacts/contracts/token/Token.sol/Token.json");
const routerAbi = require("../artifacts/contracts/common/uniswap/IUniswapV2Router02.sol/IUniswapV2Router02.json");
const { produecSignaturewithdrawHash, fixSig } = require("./utils/BridgeUtils");
const { BigNumber } = require("ethers");
import {
  convertIntoAssetTypesObjectForSource,
  convertIntoAssetTypesObjectForTarget,
} from "../app/lib/middlewares/helpers/assetTypeHelper";
import {
  createCudosResponse,
  createEVMResponse,
  IN_SUFFICIENT_LIQUIDITY_ERROR,
  CODE_701,
} from "../app/lib/middlewares/helpers/withdrawResponseHelper";
import { getAmountOut } from "../app/lib/middlewares/helpers/dexContractHelper";
import { OneInchSwap } from "../app/lib/httpCalls/oneInchAxiosHelper";
import {
  isLiquidityAvailableForEVM,
  isLiquidityAvailableForCudos,
} from "../app/lib/middlewares/helpers/liquidityHelper";
import {
  getSignature,
  getWithdrawalDataHashForSwap,
} from "../app/lib/middlewares/helpers/signatureHelper";
import {
  getGasForSwap,
  getGasForWithdraw,
} from "../app/lib/middlewares/helpers/gasFeeHelpers/gasEstimationHelper";
import {
  doOneInchSwap,
  doFoundaryWithdraw,
  doOneInchWithdraw,
  getDestinationAmountFromLogs,
  getValueForSwap,
} from "../app/lib/middlewares/helpers/fiberEngineHelper";
import {
  SwapOneInch,
  WithdrawSigned,
  WithdrawSignedAndSwapOneInch,
} from "../app/interfaces/fiberEngineInterface";

import {
  getWithdrawSignedObject,
  getWithdrawSignedAndSwapOneInchObject,
  sendSlackNotification,
} from "../app/lib/middlewares/helpers/fiberEngineHelper";

const cudosWithdraw = require("./cudosWithdraw");
const { ecsign, toRpcSig } = require("ethereumjs-util");
var Big = require("big.js");
const toWei = (i: any) => ethers.utils.parseEther(i);
const toEther = (i: any) => ethers.utils.formatEther(i);

// user wallet
var signer = new ethers.Wallet((global as any).environment.PRI_KEY);

module.exports = {
  web3(rpcUrl: any) {
    if (rpcUrl) {
      return new Web3(new Web3.providers.HttpProvider(rpcUrl));
    }
    return null;
  },

  fiberRouterPool(rpcUrl: any, tokenContractAddress: any) {
    let web3 = this.web3(rpcUrl).eth;
    return new web3.Contract(fiberRouterAbi.abi, tokenContractAddress);
  },

  getTransactionsCount: async function (rpcUrl: any, walletAddress: any) {
    let web3 = this.web3(rpcUrl).eth;
    if (web3) {
      let transactionCount = await web3.getTransactionCount(
        walletAddress,
        "pending"
      );
      return transactionCount;
    }
    return null;
  },

  getDeadLine: function () {
    const currentDate = new Date();
    const deadLine = currentDate.getTime() + 20 * 60000;
    return deadLine;
  },

  withdraw: async function (
    sourceTokenAddress: any,
    targetTokenAddress: any,
    sourceChainId: any,
    targetChainId: any,
    inputAmount: any,
    destinationWalletAddress: any,
    swapTransactionHash: any,
    body: any
  ) {
    let isValidLiquidityAvailable = true;
    let transactionHash = "";
    let withdrawResponse;
    let destinationAmount;
    const sourceNetwork = (global as any).commonFunctions.getNetworkByChainId(
      sourceChainId
    ).multiswapNetworkFIBERInformation;
    const targetNetwork = (global as any).commonFunctions.getNetworkByChainId(
      targetChainId
    ).multiswapNetworkFIBERInformation;

    if (!targetNetwork.isNonEVM) {
      isValidLiquidityAvailable = await isLiquidityAvailableForEVM(
        targetNetwork.foundryTokenAddress,
        targetNetwork.fundManager,
        targetNetwork.provider,
        body.destinationAmountIn
      );
    } else {
      isValidLiquidityAvailable = await isLiquidityAvailableForCudos(
        targetNetwork.foundryTokenAddress,
        targetNetwork.fundManager,
        targetNetwork.rpcUrl,
        (global as any).environment.DESTINATION_CHAIN_PRIV_KEY,
        body.destinationAmountIn
      );
    }

    if (!isValidLiquidityAvailable) {
      sendSlackNotification(
        swapTransactionHash,
        "Error: " + IN_SUFFICIENT_LIQUIDITY_ERROR,
        "Not used"
      );
      let receipt = { code: CODE_701 };
      withdrawResponse = createEVMResponse(receipt);
      let data: any = {};
      data.responseCode = withdrawResponse?.responseCode;
      data.responseMessage = withdrawResponse?.responseMessage;
      return data;
    }

    let targetTypeResponse = await convertIntoAssetTypesObjectForTarget(body);

    if (!targetNetwork.isNonEVM) {
      // ==========================================

      const targetSigner = signer.connect(targetNetwork.provider);
      const targetTokenContract = new ethers.Contract(
        await (global as any).commonFunctions.getWrappedNativeTokenAddress(
          targetTokenAddress,
          targetChainId
        ),
        tokenAbi.abi,
        targetNetwork.provider
      );
      const targetFoundryTokenContract = new ethers.Contract(
        targetNetwork.foundryTokenAddress,
        tokenAbi.abi,
        targetNetwork.provider
      );
      //convert to wei
      const targetTokenDecimal = await targetTokenContract.decimals();
      const targetFoundryTokenDecimal =
        await targetFoundryTokenContract.decimals();
      const isTargetTokenFoundry = targetTypeResponse.isFoundryAsset;
      if (isTargetTokenFoundry === true) {
        let signatureResponse: any = getSignature(body);
        let obj: WithdrawSigned = getWithdrawSignedObject(
          targetTokenAddress,
          destinationWalletAddress,
          String(signatureResponse.amount),
          signatureResponse.salt,
          body.signatureExpiry,
          String(signatureResponse.signature)
        );
        const swapResult = await doFoundaryWithdraw(
          obj,
          targetNetwork,
          targetSigner,
          targetChainId,
          swapTransactionHash,
          body?.gasLimit
        );
        const receipt = await this.callEVMWithdrawAndGetReceipt(swapResult);
        destinationAmount = (
          signatureResponse.amount /
          10 ** Number(targetTokenDecimal)
        ).toString();
        withdrawResponse = createEVMResponse(receipt);
        transactionHash = withdrawResponse?.transactionHash;
      } else {
        // 1Inch implementation
        let signatureResponse: any = getSignature(body);
        let obj: WithdrawSignedAndSwapOneInch =
          getWithdrawSignedAndSwapOneInchObject(
            destinationWalletAddress,
            body?.destinationAmountIn,
            body?.destinationAmountOut,
            targetNetwork?.foundryTokenAddress,
            targetTokenAddress,
            body.destinationOneInchData,
            signatureResponse.salt,
            body.signatureExpiry,
            String(signatureResponse.signature),
            body.destinationOneInchSelector
          );
        const swapResult = await doOneInchWithdraw(
          obj,
          targetNetwork,
          targetSigner,
          targetChainId,
          swapTransactionHash,
          body?.gasLimit
        );
        const receipt = await swapResult?.wait();
        let destinationAmountOut = getDestinationAmountFromLogs(
          receipt,
          targetNetwork?.rpcUrl,
          body?.destinationAmountOut,
          true
        );
        destinationAmount = (global as any).commonFunctions.decimalsIntoNumber(
          destinationAmountOut,
          targetTokenDecimal
        );
        withdrawResponse = createEVMResponse(receipt);
        transactionHash = withdrawResponse?.transactionHash;
      }
    }

    let data: any = {};
    data.txHash = withdrawResponse?.transactionHash;
    data.destinationAmount = String(destinationAmount);
    data.responseCode = withdrawResponse?.responseCode;
    data.responseMessage = withdrawResponse?.responseMessage;
    return data;
  },

  swapForAbi: async function (
    sourceWalletAddress: any,
    sourceTokenAddress: any,
    targetTokenAddress: any,
    sourceChainId: any,
    targetChainId: any,
    inputAmount: any,
    destinationWalletAddress: any,
    query: any
  ) {
    try {
      const sourceNetwork = (global as any).commonFunctions.getNetworkByChainId(
        sourceChainId
      ).multiswapNetworkFIBERInformation;
      const targetNetwork = (global as any).commonFunctions.getNetworkByChainId(
        targetChainId
      ).multiswapNetworkFIBERInformation;

      if (sourceNetwork.isNonEVM) {
        throw "CUDOS Swap: Please Perform Swap From Frontend";
      }
      let fiberRouter = this.fiberRouterPool(
        sourceNetwork.rpc,
        sourceNetwork.fiberRouter
      );

      // source token contract (required to approve function)
      const sourceTokenContract = new ethers.Contract(
        await (global as any).commonFunctions.getWrappedNativeTokenAddress(
          sourceTokenAddress,
          sourceChainId
        ),
        tokenAbi.abi,
        sourceNetwork.provider
      );

      const sourceTokenDecimal = await sourceTokenContract.decimals();
      let amount = (global as any).commonFunctions.numberIntoDecimals(
        inputAmount,
        sourceTokenDecimal
      );
      let sourceTypeResponse = await convertIntoAssetTypesObjectForSource(
        query
      );
      const isFoundryAsset = sourceTypeResponse.isFoundryAsset;
      const isRefineryAsset = sourceTypeResponse.isRefineryAsset;
      const isIonicAsset = sourceTypeResponse.isIonicAsset;
      const isOneIncheAsset = sourceTypeResponse.isOneInch;

      let sourceBridgeAmount;
      let swapResult;
      if (isFoundryAsset) {
        if (!targetNetwork.isNonEVM) {
          swapResult = fiberRouter.methods.swap(
            sourceTokenAddress,
            amount,
            targetChainId,
            await (global as any).commonFunctions.getOneInchTokenAddress(
              targetTokenAddress
            ),
            destinationWalletAddress,
            getWithdrawalDataHashForSwap(
              query?.sourceOneInchData,
              query?.destinationOneInchData,
              query?.destinationAmountIn,
              query?.destinationAmountOut,
              query?.sourceAssetType,
              query?.destinationAssetType
            )
          );
          sourceBridgeAmount = amount;
        } else if (targetNetwork.isNonEVM) {
          // // approve to fiber router to transfer tokens to the fund manager contract
          // const targetFoundryTokenAddress =
          //   await sourceNetwork.fundManagerContract.nonEvmAllowedTargets(
          //     sourceTokenAddress,
          //     targetChainId
          //   );
          // // fiber router add foundry asset to fund manager
          // swapResult = fiberRouter.methods.nonEvmSwap(
          //   sourceTokenAddress,
          //   amount,
          //   targetChainId,
          //   targetFoundryTokenAddress,
          //   destinationWalletAddress,
          //   query.destinationAmountIn
          // );
          // //wait until the transaction be completed
          // sourceBridgeAmount = amount;
        }
      } else {
        // 1Inch implementation
        if (!targetNetwork.isNonEVM) {
          let withdrawalData = getWithdrawalDataHashForSwap(
            query?.sourceOneInchData,
            query?.destinationOneInchData,
            query?.destinationAmountIn,
            query?.destinationAmountOut,
            query?.sourceAssetType,
            query?.destinationAssetType
          );
          let obj: SwapOneInch = {
            amountIn: amount,
            amountOut: query?.sourceBridgeAmount,
            targetChainId: targetChainId,
            targetTokenAddress: targetTokenAddress,
            destinationWalletAddress: destinationWalletAddress,
            sourceOneInchData: query?.sourceOneInchData,
            sourceTokenAddress: sourceTokenAddress,
            foundryTokenAddress: sourceNetwork.foundryTokenAddress,
            withdrawalData: withdrawalData,
            gasPrice: query?.gasPrice,
            oneInchSelector: query?.sourceOneInchSelector,
          };
          swapResult = await doOneInchSwap(obj, fiberRouter);
        } else {
          // swapResult = fiberRouter.methods.nonEvmSwapAndCrossOneInch(
          //   sourceNetwork?.router,
          //   amount,
          //   query?.sourceBridgeAmount,
          //   targetChainId,
          //   targetNetwork.foundryTokenAddress,
          //   destinationWalletAddress,
          //   query?.sourceOneInchData,
          //   sourceTokenAddress,
          //   sourceNetwork.foundryTokenAddress,
          //   query?.destinationAmountIn
          // );
        }
      }

      let data = "";
      if (swapResult) {
        data = swapResult.encodeABI();
      }
      let nonce = await this.getTransactionsCount(
        sourceNetwork.rpc,
        sourceWalletAddress
      );

      let returnData = {
        currency: sourceNetwork.shortName + ":" + sourceTokenAddress,
        from: sourceWalletAddress,
        amount: "0",
        contract: sourceNetwork.fiberRouter,
        data: data,
        nonce,
        description: `Swap `,
        ...(await getGasForSwap(sourceChainId, destinationWalletAddress)),
      };
      let value = getValueForSwap(
        amount,
        query?.gasPrice,
        await (global as any).commonFunctions.isNativeToken(sourceTokenAddress)
      );
      returnData = { ...returnData, value: value };
      return returnData;
    } catch (error) {
      throw { error };
    }
  },

  callEVMWithdrawAndGetReceipt: async function (data: any) {
    let receipt: any = { status: 0, responseMessage: "" };
    try {
      receipt = await data?.wait();
    } catch (e) {
      receipt.responseMessage = e;
    }
    return receipt;
  },
};
