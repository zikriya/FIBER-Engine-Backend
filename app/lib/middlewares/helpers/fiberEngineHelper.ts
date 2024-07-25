const { Big } = require("big.js");
import {
  SwapOneInch,
  WithdrawSigned,
  WithdrawSignedAndSwapOneInch,
  WithdrawOneInchLogs,
} from "../../../interfaces/fiberEngineInterface";
import {
  getGasForWithdraw,
  isAllowedDynamicGasValues,
  addBuffer,
} from "../../middlewares/helpers/gasFeeHelpers/gasEstimationHelper";
import { getLogsFromTransactionReceipt } from "../../middlewares/helpers/web3Helpers/web3Helper";
import { postAlertIntoChannel } from "../../httpCalls/slackAxiosHelper";
const MAX_WITH_DYNAMIC_GAS_WITHDRAW_TRIES = 9;
const MAX_WITHDRAW_TRIES = 10;

export const getWithdrawSignedObject = (
  targetTokenAddress: string,
  destinationWalletAddress: string,
  destinationAmountIn: string,
  salt: string,
  signatureExpiry: number,
  signature: string
): WithdrawSigned => {
  let object: WithdrawSigned = {
    targetTokenAddress: targetTokenAddress,
    destinationWalletAddress: destinationWalletAddress,
    destinationAmountIn: destinationAmountIn,
    salt: salt,
    signatureExpiry: signatureExpiry,
    signature: signature,
  };
  return object;
};

export const getWithdrawSignedAndSwapOneInchObject = (
  destinationWalletAddress: string,
  destinationAmountIn: string,
  destinationAmountOut: string,
  targetFoundryTokenAddress: string,
  targetTokenAddress: string,
  destinationOneInchData: string,
  salt: string,
  signatureExpiry: number,
  signature: string
): WithdrawSignedAndSwapOneInch => {
  let object: WithdrawSignedAndSwapOneInch = {
    destinationWalletAddress: destinationWalletAddress,
    destinationAmountIn: destinationAmountIn,
    destinationAmountOut: destinationAmountOut,
    targetFoundryTokenAddress: targetFoundryTokenAddress,
    targetTokenAddress: targetTokenAddress,
    destinationOneInchData: destinationOneInchData,
    salt: salt,
    signatureExpiry: signatureExpiry,
    signature: signature,
  };
  return object;
};

export const doFoundaryWithdraw = async (
  obj: WithdrawSigned,
  targetNetwork: any,
  targetSigner: any,
  targetChainId: any,
  swapTransactionHash: string,
  gasLimit: string,
  count = 0
): Promise<any> => {
  let result;
  let dynamicGasPrice: any;
  try {
    let isAllowedDynamicGas = await isAllowedDynamicGasValues(targetChainId);
    if (count > 0) {
      gasLimit = "";
    }
    if (
      isAllowedDynamicGas &&
      count < MAX_WITH_DYNAMIC_GAS_WITHDRAW_TRIES &&
      !gasLimit
    ) {
      dynamicGasPrice = await targetNetwork.fiberRouterContract
        .connect(targetSigner)
        .estimateGas.withdrawSigned(
          await (global as any).commonFunctions.getOneInchTokenAddress(
            obj.targetTokenAddress
          ),
          obj.destinationWalletAddress,
          obj.destinationAmountIn,
          obj.salt,
          obj.signatureExpiry,
          obj.signature
        );
      dynamicGasPrice = await addBuffer(dynamicGasPrice, targetChainId, true);
    } else if (isAllowedDynamicGas && gasLimit) {
      dynamicGasPrice = await addBuffer(new Big(gasLimit), targetChainId, true);
    }
    console.log("dynamicGasPrice", dynamicGasPrice);
    result = await targetNetwork.fiberRouterContract
      .connect(targetSigner)
      .withdrawSigned(
        await (global as any).commonFunctions.getOneInchTokenAddress(
          obj.targetTokenAddress
        ),
        obj.destinationWalletAddress,
        obj.destinationAmountIn,
        obj.salt,
        obj.signatureExpiry,
        obj.signature,
        await getGasForWithdraw(targetChainId, dynamicGasPrice)
      );
  } catch (e) {
    console.log(e);
    sendSlackNotification(
      swapTransactionHash,
      e,
      getGasLimitTagForSlackNotification(dynamicGasPrice, gasLimit)
    );
    await delay();
    count = count + 1;
    if (count < MAX_WITHDRAW_TRIES) {
      result = await doFoundaryWithdraw(
        obj,
        targetNetwork,
        targetSigner,
        targetChainId,
        swapTransactionHash,
        gasLimit,
        count
      );
    }
  }
  return result;
};

export const doOneInchWithdraw = async (
  obj: WithdrawSignedAndSwapOneInch,
  targetNetwork: any,
  targetSigner: any,
  targetChainId: any,
  swapTransactionHash: string,
  gasLimit: string,
  count = 0
): Promise<any> => {
  let result;
  let dynamicGasPrice: any;
  try {
    let isAllowedDynamicGas = await isAllowedDynamicGasValues(targetChainId);
    if (count > 0) {
      gasLimit = "";
    }
    if (
      isAllowedDynamicGas &&
      count < MAX_WITH_DYNAMIC_GAS_WITHDRAW_TRIES &&
      !gasLimit
    ) {
      dynamicGasPrice = await targetNetwork.fiberRouterContract
        .connect(targetSigner)
        .estimateGas.withdrawSignedAndSwapOneInch(
          obj.destinationWalletAddress,
          obj.destinationAmountIn,
          obj.destinationAmountOut,
          obj.targetFoundryTokenAddress,
          await (global as any).commonFunctions.getOneInchTokenAddress(
            obj.targetTokenAddress
          ),
          obj.destinationOneInchData,
          obj.salt,
          obj.signatureExpiry,
          obj.signature
        );
      dynamicGasPrice = await addBuffer(dynamicGasPrice, targetChainId, true);
    } else if (isAllowedDynamicGas && gasLimit) {
      dynamicGasPrice = await addBuffer(new Big(gasLimit), targetChainId, true);
    }
    console.log("dynamicGasPrice", dynamicGasPrice);
    result = await targetNetwork.fiberRouterContract
      .connect(targetSigner)
      .withdrawSignedAndSwapOneInch(
        obj.destinationWalletAddress,
        obj.destinationAmountIn,
        obj.destinationAmountOut,
        obj.targetFoundryTokenAddress,
        await (global as any).commonFunctions.getOneInchTokenAddress(
          obj.targetTokenAddress
        ),
        obj.destinationOneInchData,
        obj.salt,
        obj.signatureExpiry,
        obj.signature,
        await getGasForWithdraw(targetChainId, dynamicGasPrice)
      );
  } catch (e) {
    console.log(e);
    sendSlackNotification(
      swapTransactionHash,
      e,
      getGasLimitTagForSlackNotification(dynamicGasPrice, gasLimit)
    );
    await delay();
    count = count + 1;
    if (count < MAX_WITHDRAW_TRIES) {
      result = await doOneInchWithdraw(
        obj,
        targetNetwork,
        targetSigner,
        targetChainId,
        swapTransactionHash,
        gasLimit,
        count
      );
    }
  }
  return result;
};

export const doOneInchSwap = async (
  obj: SwapOneInch,
  fiberRouter: any
): Promise<any> => {
  let result;
  try {
    if (
      await (global as any).commonFunctions.isNativeToken(
        obj.sourceTokenAddress
      )
    ) {
      result = fiberRouter.methods.swapAndCrossOneInchETH(
        obj.amountOut,
        obj.targetChainId,
        await (global as any).commonFunctions.getOneInchTokenAddress(
          obj.targetTokenAddress
        ),
        obj.destinationWalletAddress,
        obj.sourceOneInchData,
        obj.foundryTokenAddress,
        obj.withdrawalData,
        obj.gasPrice
      );
    } else {
      result = fiberRouter.methods.swapAndCrossOneInch(
        obj.amountIn,
        obj.amountOut,
        obj.targetChainId,
        await (global as any).commonFunctions.getOneInchTokenAddress(
          obj.targetTokenAddress
        ),
        obj.destinationWalletAddress,
        obj.sourceOneInchData,
        obj.sourceTokenAddress,
        obj.foundryTokenAddress,
        obj.withdrawalData
      );
    }
  } catch (e) {
    console.log(e);
  }
  return result;
};

export const getDestinationAmountFromLogs = (
  recipet: any,
  rpcUrl: string,
  destinationAmount: string,
  isOneInch: boolean
): any => {
  if (recipet) {
    let decodedLog: WithdrawOneInchLogs = getLogsFromTransactionReceipt(
      recipet,
      rpcUrl,
      true
    );
    if (decodedLog) {
      console.log("destinationAmountFromLogs:", decodedLog[2]);
      return decodedLog[2];
    }
  }
  return destinationAmount;
};

export const sendSlackNotification = async (
  swapHash: string,
  mesg: any,
  gasLimitTag: any
) => {
  try {
    let body = `FIBER Engine Backend Alert\nswapHash:\n${swapHash}\ngasLimit:\n${gasLimitTag}\n\n${mesg?.toString()}\n========================`;
    await postAlertIntoChannel({ text: body });
  } catch (e) {
    console.log(e);
  }
};

export const getValueForSwap = (
  amount: any,
  gasPrice: any,
  isNative: boolean
) => {
  try {
    console.log(
      "amount:",
      amount,
      "gasPrice:",
      gasPrice,
      "isNative:",
      isNative
    );
    if (isNative) {
      amount = new Big(amount);
      gasPrice = new Big(gasPrice);
      let value = amount.add(gasPrice);
      console.log("value", value.toString());
      return value.toString();
    } else {
      return gasPrice;
    }
  } catch (e) {
    console.log(e);
  }
};

export const isOutOfGasError = async (
  error: any,
  totalGas: any
): Promise<Boolean> => {
  try {
    const gasUsed = error?.receipt?.gasUsed?.toString();
    if (gasUsed) {
      console.log("gas used:", gasUsed, "totalGas:", totalGas);
      let percentage: any = (100 * Number(gasUsed)) / Number(totalGas);
      percentage = percentage.toFixed(2);
      console.log(percentage, Number(percentage));
      if (Number(percentage) > 98) {
        console.log("isOutOfGasError: true");
        return true;
      }
    }
  } catch (e) {
    console.log(e);
  }
  return false;
};

export const doCCTPFlow = async (
  network: any,
  messageBytes: string,
  messageHash: string,
  isCCTP: boolean
) => {
  console.log(
    "isCCTP",
    isCCTP,
    "network.rpcUrl",
    network.rpcUrl,
    "chainId",
    network.chainId
  );
  if (!isCCTP) {
    return "";
  }
  let contract: Contract = {
    rpcUrl: network.rpcUrl,
    contractAddress: network.cctpmessageTransmitterAddress,
  };
  let attestationSignature = await getAttestation(messageHash);
  console.log("attestationSignature:", attestationSignature);
  sendSlackNotification(
    messageHash,
    "attestationSignature: " + attestationSignature,
    null
  );
  if (!attestationSignature) {
    return attestationSignatureError;
  }
  await doMessageTransmitter(
    contract,
    network,
    messageBytes,
    attestationSignature
  );
};

const doMessageTransmitter = async (
  contract: any,
  network: any,
  messageBytes: string,
  attestationSignature: string
) => {
  for (let count = 0; count < 5; count++) {
    if (
      await messageTransmitter(
        contract,
        network,
        messageBytes,
        attestationSignature
      )
    ) {
      return "";
    }
    await delay();
  }
};

export const getLatestCallData = async (
  walletAddress: string,
  chainId: string,
  src: any,
  dst: string,
  amount: string,
  slippage: string,
  from: string,
  to: string,
  recursionCount = 0
) => {
  let providerResponse: any = await chooseProviderAndGetData(
    walletAddress,
    chainId,
    src,
    dst,
    amount,
    slippage,
    from,
    to,
    true
  );
  if (
    providerResponse?.responseMessage &&
    providerResponse?.responseMessage == genericProviderError &&
    recursionCount < (await getProviderApiThreshold())
  ) {
    console.log("responseMessage", providerResponse?.responseMessage);
    await delay();
    recursionCount = recursionCount + 1;
    providerResponse = await getLatestCallData(
      walletAddress,
      chainId,
      src,
      dst,
      amount,
      slippage,
      from,
      to,
      recursionCount
    );
  }
  return providerResponse?.callData ? providerResponse?.callData : "";
};

export const handleWithdrawalErrors = async (
  swapTransactionHash: string,
  error: string,
  code: any
) => {
  sendSlackNotification(swapTransactionHash, "Error: " + error, "Not used");
  let receipt = { code: code };
  let withdrawResponse = createEVMResponse(receipt);
  let data: any = {};
  data.responseCode = withdrawResponse?.responseCode;
  data.responseMessage = withdrawResponse?.responseMessage;
  return data;
};

const getGasLimitTagForSlackNotification = (
  dynamicGasPrice: any,
  gasLimit: any
) => {
  let type = "Secondary";
  if (gasLimit) {
    type = "Primary";
  }
  return dynamicGasPrice?.toString() + " " + type;
};

const delay = () => new Promise((res) => setTimeout(res, 10000));
