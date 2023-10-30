var { ethers } = require("ethers");
var Web3 = require("web3");
require("dotenv").config();
const fundManagerAbi = require("../artifacts/contracts/upgradeable-Bridge/FundManager.sol/FundManager.json");
const fiberRouterAbi = require("../artifacts/contracts/upgradeable-Bridge/FiberRouter.sol/FiberRouter.json");
var tokenAbi = require("../artifacts/contracts/token/Token.sol/Token.json");
const routerAbi = require("../artifacts/contracts/common/uniswap/IUniswapV2Router02.sol/IUniswapV2Router02.json");
const { produecSignaturewithdrawHash, fixSig } = require("./utils/BridgeUtils");
const { BigNumber } = require("ethers");
import { convertIntoAssetTypesObjectForSource } from "../app/lib/middlewares/helpers/assetTypeHelper";
import {
  createCudosResponse,
  createEVMResponse,
} from "../app/lib/middlewares/helpers/withdrawResponseHelper";
import { getAmountOut } from "../app/lib/middlewares/helpers/dexContractHelper";

const cudosWithdraw = require("./cudosWithdraw");
const { ecsign, toRpcSig } = require("ethereumjs-util");
var Big = require("big.js");
const toWei = (i: any) => ethers.utils.parseEther(i);
const toEther = (i: any) => ethers.utils.formatEther(i);
const MAX_FEE_PER_GAS = "60";
const MAX_PRIORITY_FEE_PER_GAS = "60";
const GAS_LIMIT = "2000000";

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
    salt: any,
    body: any
  ) {
    console.log(1);
    const gas = await this.estimateGasForWithdraw(
      targetChainId,
      destinationWalletAddress
    );
    const sourceNetwork = (global as any).commonFunctions.getNetworkByChainId(
      sourceChainId
    ).multiswapNetworkFIBERInformation;
    const targetNetwork = (global as any).commonFunctions.getNetworkByChainId(
      targetChainId
    ).multiswapNetworkFIBERInformation;

    let transactionHash = "";
    let withdrawResponse;
    let destinationAmount;
    let targetTypeResponse = await convertIntoAssetTypesObjectForSource(body);

    if (!targetNetwork.isNonEVM) {
      // ==========================================

      const targetSigner = signer.connect(targetNetwork.provider);
      const targetTokenContract = new ethers.Contract(
        targetTokenAddress,
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
        let signatureResponse = await (
          global as any
        ).signatureHelper.getSignature(
          body,
          (global as any).utils.assetType.FOUNDARY
        );
        const swapResult = await targetNetwork.fiberRouterContract
          .connect(targetSigner)
          .withdrawSigned(
            targetTokenAddress,
            destinationWalletAddress,
            String(signatureResponse.amount),
            signatureResponse.salt,
            String(signatureResponse.signature),
            gas
          );
        const receipt1 = await this.callEVMWithdrawAndGetReceipt(swapResult);
        console.log("receipt1", receipt1);
        destinationAmount = (
          signatureResponse.amount /
          10 ** Number(targetTokenDecimal)
        ).toString();
        withdrawResponse = createEVMResponse(receipt1);
        transactionHash = withdrawResponse?.transactionHash;
        console.log("Transaction hash is: swapResult", receipt1.hash);
      } else {
        const isTargetRefineryToken = targetTypeResponse.isRefineryAsset;
        if (isTargetRefineryToken == true) {
          let path2 = [targetNetwork.foundryTokenAddress, targetTokenAddress];
          let signatureResponse = await (
            global as any
          ).signatureHelper.getSignature(
            body,
            (global as any).utils.assetType.REFINERY
          );
          let response = await getAmountOut(
            targetNetwork,
            path2,
            String(signatureResponse.amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut2 = response?.amounts[1];
          const swapResult2 = await targetNetwork.fiberRouterContract
            .connect(targetSigner)
            .withdrawSignedAndSwap(
              destinationWalletAddress,
              targetNetwork.router,
              String(signatureResponse.amount),
              String(amountsOut2),
              path2,
              this.getDeadLine().toString(),
              signatureResponse.salt,
              String(signatureResponse.signature),
              gas
            );
          const receipt2 = await swapResult2.wait();
          if (receipt2.status == 1) {
            if (swapResult2 && swapResult2.hash) {
              destinationAmount = (
                amountsOut2 /
                10 ** Number(targetTokenDecimal)
              ).toString();
              withdrawResponse = createEVMResponse(swapResult2);
              transactionHash = withdrawResponse?.transactionHash;
              console.log("Transaction hash is:swapResult2 ", swapResult2.hash);
            }
          }
        } else {
          let path2 = [
            targetNetwork.foundryTokenAddress,
            targetNetwork.weth,
            targetTokenAddress,
          ];
          let signatureResponse = await (
            global as any
          ).signatureHelper.getSignature(
            body,
            (global as any).utils.assetType.IONIC
          );
          let response = await getAmountOut(
            targetNetwork,
            path2,
            String(signatureResponse.amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut2 = response?.amounts[response?.amounts.length - 1];
          const swapResult3 = await targetNetwork.fiberRouterContract
            .connect(targetSigner)
            .withdrawSignedAndSwap(
              destinationWalletAddress,
              targetNetwork.router,
              String(signatureResponse.amount),
              String(amountsOut2),
              path2,
              this.getDeadLine().toString(), //deadline
              signatureResponse.salt,
              String(signatureResponse.signature),
              gas
            );
          const receipt3 = await swapResult3.wait();
          if (receipt3.status == 1) {
            if (swapResult3 && swapResult3.hash) {
              destinationAmount = (
                amountsOut2 /
                10 ** Number(targetTokenDecimal)
              ).toString();
              withdrawResponse = createEVMResponse(swapResult3);
              transactionHash = withdrawResponse?.transactionHash;
              console.log("Transaction hash is: ", swapResult3.hash);
            }
          }
        }
      }
    } else if (targetNetwork.isNonEVM) {
      let signatureResponse = await (
        global as any
      ).signatureHelper.getSignature(
        body,
        (global as any).utils.assetType.IONIC
      );
      const swapResult = await cudosWithdraw(
        targetTokenAddress,
        String(signatureResponse.amount),
        destinationWalletAddress,
        targetNetwork.fundManager,
        targetNetwork.fiberRouter,
        targetNetwork.rpcUrl,
        (global as any).environment.DESTINATION_CHAIN_PRIV_KEY,
        (global as any).environment.CUDOS_GAS_PRICE,
        signatureResponse.salt,
        String(signatureResponse.signature)
      );
      console.log("swapResult.transactionHash", swapResult.transactionHash);
      withdrawResponse = createCudosResponse(swapResult);
      transactionHash = withdrawResponse?.transactionHash;
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
        sourceTokenAddress,
        tokenAbi.abi,
        sourceNetwork.provider
      );

      const sourceTokenDecimal = await sourceTokenContract.decimals();
      let amount = (inputAmount * 10 ** Number(sourceTokenDecimal)).toString();
      amount = (global as any).utils.convertFromExponentialToDecimal(amount);
      console.log(
        "INIT: Swap Initiated for this Amount: ",
        amount,
        inputAmount
      );

      let sourceTypeResponse = await convertIntoAssetTypesObjectForSource(
        query
      );
      const isFoundryAsset = sourceTypeResponse.isFoundryAsset;
      const isRefineryAsset = sourceTypeResponse.isRefineryAsset;
      const isIonicAsset = sourceTypeResponse.isIonicAsset;

      let sourceBridgeAmount;
      let swapResult;
      if (isFoundryAsset) {
        if (!targetNetwork.isNonEVM) {
          console.log("SN-1: Source Token is Foundry Asset");
          console.log("SN-2: Add Foundry Asset in Source Network FundManager");
          // approve to fiber router to transfer tokens to the fund manager contract
          const targetFoundryTokenAddress =
            await sourceNetwork.fundManagerContract.allowedTargets(
              sourceTokenAddress,
              targetChainId
            );
          // fiber router add foundry asset to fund manager
          swapResult = fiberRouter.methods.swap(
            sourceTokenAddress,
            amount,
            targetChainId,
            targetFoundryTokenAddress,
            destinationWalletAddress,
            query.destinationAmount
          );
          //wait until the transaction be completed
          sourceBridgeAmount = amount;
        } else if (targetNetwork.isNonEVM) {
          console.log("SN-1: Non Evm Source Token is Foundry Asset");
          console.log(
            "SN-2: Non Evm Add Foundry Asset in Source Network FundManager"
          );
          // approve to fiber router to transfer tokens to the fund manager contract
          const targetFoundryTokenAddress =
            await sourceNetwork.fundManagerContract.nonEvmAllowedTargets(
              sourceTokenAddress,
              targetChainId
            );
          // fiber router add foundry asset to fund manager
          swapResult = fiberRouter.methods.nonEvmSwap(
            sourceTokenAddress,
            amount,
            targetChainId,
            targetFoundryTokenAddress,
            destinationWalletAddress
          );
          //wait until the transaction be completed
          sourceBridgeAmount = amount;
        }
      } else if (isRefineryAsset) {
        if (!targetNetwork.isNonEVM) {
          //swap refinery token to the foundry token
          let path = [sourceTokenAddress, sourceNetwork.foundryTokenAddress];
          let response = await getAmountOut(
            sourceNetwork,
            path,
            String(amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut = response?.amounts[1];
          sourceBridgeAmount = amountsOut;
          swapResult = fiberRouter.methods.swapAndCross(
            sourceNetwork.dexContract.address,
            amount,
            amountsOut,
            path,
            this.getDeadLine().toString(), // deadline
            targetChainId,
            targetNetwork.foundryTokenAddress,
            destinationWalletAddress,
            query.destinationAmount
          );
        } else if (targetNetwork.isNonEVM) {
          console.log("SN-1: Non Evm Source Token is Refinery Asset");
          console.log("SN-2: Non Evm Swap Refinery Asset to Foundry Asset ...");
          //swap refinery token to the foundry token
          // const amount = await (inputAmount * 10 ** Number(targetNetwork.decimals)).toString();
          let path = [sourceTokenAddress, sourceNetwork.foundryTokenAddress];
          let response = await getAmountOut(
            sourceNetwork,
            path,
            String(amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut = response?.amounts[1];
          sourceBridgeAmount = amountsOut;
          swapResult = fiberRouter.methods.nonEvmSwapAndCross(
            sourceNetwork.dexContract.address,
            amount,
            amountsOut,
            path,
            this.getDeadLine().toString(), // deadline
            targetChainId,
            targetNetwork.foundryTokenAddress,
            destinationWalletAddress
          );
        }
      } else {
        if (!targetNetwork.isNonEVM) {
          console.log("SN-1: Source Token is Ionic Asset");
          console.log("SN-2: Swap Ionic Asset to Foundry Asset ...");
          //swap refinery token to the foundry token
          let path = [
            sourceTokenAddress,
            sourceNetwork.weth,
            sourceNetwork.foundryTokenAddress,
          ];
          console.log("path", path);
          let response = await getAmountOut(
            sourceNetwork,
            path,
            String(amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut = response?.amounts[response?.amounts.length - 1];
          sourceBridgeAmount = amountsOut;
          swapResult = fiberRouter.methods.swapAndCross(
            sourceNetwork.dexContract.address,
            amount,
            amountsOut,
            path,
            this.getDeadLine().toString(), // deadline
            targetChainId,
            targetNetwork.foundryTokenAddress,
            destinationWalletAddress,
            query.destinationAmount
          );
        } else if (targetNetwork.isNonEVM) {
          console.log("SN-1: Non Evm Source Token is Ionic Asset");
          console.log("SN-2: Non Evm Swap Ionic Asset to Foundry Asset ...");
          //swap refinery token to the foundry token
          let path = [
            sourceTokenAddress,
            sourceNetwork.weth,
            sourceNetwork.foundryTokenAddress,
          ];
          console.log("path", path);
          let response = await getAmountOut(
            sourceNetwork,
            path,
            String(amount)
          );
          if (response?.responseMessage) {
            throw response?.responseMessage;
          }
          const amountsOut = response?.amounts[response?.amounts.length - 1];
          sourceBridgeAmount = amountsOut;
          swapResult = fiberRouter.methods.nonEvmSwapAndCross(
            sourceNetwork.dexContract.address,
            amount,
            amountsOut,
            path,
            this.getDeadLine().toString(), // deadline
            targetChainId,
            targetNetwork.foundryTokenAddress,
            destinationWalletAddress
          );
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

      return {
        currency: sourceNetwork.shortName + ":" + sourceTokenAddress,
        from: sourceWalletAddress,
        amount: "0",
        contract: sourceNetwork.fiberRouter,
        data: data,
        nonce,
        description: `Swap `,
        ...(await this.estimateGasForSwap(
          sourceChainId,
          destinationWalletAddress
        )),
      };
    } catch (error) {
      throw { error };
    }
  },

  callEVMWithdrawAndGetReceipt: async function (data: any) {
    let receipt: any = { status: 0, responseMessage: "" };
    try {
      receipt = await data.wait();
      console.log("swapResult receipt", receipt);
    } catch (e) {
      console.log("swapResult receipt error", e);
      receipt.responseMessage = e;
    }
    return receipt;
  },

  estimateGasForWithdraw: async function (sourceChainId: any, from: any) {
    let data: any = {};
    let network = (global as any).commonFunctions.getNetworkByChainId(
      sourceChainId
    );
    let item = await db.GasFees.findOne({ chainId: sourceChainId });
    if (item && network) {
      let maxFeePerGas = MAX_FEE_PER_GAS;
      let maxPriorityFeePerGas = MAX_PRIORITY_FEE_PER_GAS;
      let gasLimit = GAS_LIMIT;
      let isAllowedDynamicGasValues = network?.isAllowedDynamicGasValues;

      maxFeePerGas = isAllowedDynamicGasValues
        ? item.dynamicValues.maxFeePerGas
        : item.maxFeePerGas;
      maxPriorityFeePerGas = isAllowedDynamicGasValues
        ? item.dynamicValues.maxPriorityFeePerGas
        : item.maxPriorityFeePerGas;
      gasLimit = item.gasLimit;

      data.maxFeePerGas = Web3.utils.toHex(
        Web3.utils.toWei(maxFeePerGas, "gwei")
      );
      data.maxPriorityFeePerGas = Web3.utils.toHex(
        Web3.utils.toWei(maxPriorityFeePerGas, "gwei")
      );

      // data.gasLimit = gasLimit;
    } else {
      data.gasPrice = 15000000000;
    }
    return data;
  },

  estimateGasForSwap: async function (sourceChainId: any, from: any) {
    let data: any = {};
    let network = (global as any).commonFunctions.getNetworkByChainId(
      sourceChainId
    );
    let item = await db.GasFees.findOne({ chainId: sourceChainId });
    if (item && network) {
      let maxFeePerGas = MAX_FEE_PER_GAS;
      let maxPriorityFeePerGas = MAX_PRIORITY_FEE_PER_GAS;
      let gasLimit = GAS_LIMIT;
      let isAllowedDynamicGasValues = network?.isAllowedDynamicGasValues;

      maxFeePerGas = isAllowedDynamicGasValues
        ? item.dynamicValues.maxFeePerGas
        : item.maxFeePerGas;
      maxPriorityFeePerGas = isAllowedDynamicGasValues
        ? item.dynamicValues.maxPriorityFeePerGas
        : item.maxPriorityFeePerGas;
      gasLimit = item.gasLimit;

      data.maxFeePerGas = Web3.utils.toHex(
        Web3.utils.toWei(maxFeePerGas, "gwei")
      );
      data.maxPriorityFeePerGas = Web3.utils.toHex(
        Web3.utils.toWei(maxPriorityFeePerGas, "gwei")
      );
      // data.gas = { gasLimit: gasLimit };
    } else {
      data.gas = {};
    }
    return data;
  },
};
