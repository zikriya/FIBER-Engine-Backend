import moment from "moment";
import Web3 from "web3";
import crypto from "crypto";
import { ethers } from "ethers";
import { _TypedDataEncoder } from "ethers/lib/utils";
import { FeeDistribution } from "../../../../interfaces/feeDistributionInterface";
const CONTRACT_NAME = "FEE_DISTRIBUTOR";
const CONTRACT_VERSION = "000.001";

export const getSaltAndExpiryData = () => {
  const salt = Web3.utils.keccak256(crypto.randomBytes(512).toString("hex"));
  const expiry = getExpiry();
  return { salt, expiry };
};

export const getFeeDistributionSignature = async (
  token: string,
  network: any,
  fiberRouterContractAddress: any,
  feeDistribution: FeeDistribution,
  salt: any,
  expiry: any,
  sourceAmountIn: string,
  sourceAmountOut: string,
  destinationAmountIn: string,
  destinationAmountOut: string
) => {
  console.log("feeAllocations", feeDistribution?.feeAllocations);
  console.log("totalPlatformFee", feeDistribution?.totalPlatformFee);
  console.log(
    "sourceAmountIn:",
    sourceAmountIn,
    "sourceAmountOut:",
    sourceAmountOut,
    "destinationAmountIn:",
    destinationAmountIn,
    "destinationAmountOut:",
    destinationAmountOut
  );

  const domain = {
    name: CONTRACT_NAME,
    version: CONTRACT_VERSION,
    chainId: network.chainId,
    verifyingContract: fiberRouterContractAddress,
  };
  const types = {
    FeeAllocation: [
      { name: "recipient", type: "address" },
      { name: "platformFee", type: "uint256" },
    ],
    DistributeFees: [
      { name: "token", type: "address" },
      { name: "feeAllocations", type: "FeeAllocation[]" },
      { name: "totalPlatformFee", type: "uint256" },
      { name: "sourceAmountIn", type: "uint256" },
      { name: "sourceAmountOut", type: "uint256" },
      { name: "destinationAmountIn", type: "uint256" },
      { name: "destinationAmountOut", type: "uint256" },
      { name: "salt", type: "bytes32" },
      { name: "expiry", type: "uint256" },
    ],
  };
  const values = {
    token: token,
    feeAllocations: feeDistribution?.feeAllocations,
    totalPlatformFee: feeDistribution?.totalPlatformFee,
    sourceAmountIn: sourceAmountIn,
    sourceAmountOut: sourceAmountOut,
    destinationAmountIn: destinationAmountIn,
    destinationAmountOut: destinationAmountOut,
    salt: salt,
    expiry: expiry,
  };
  var wallet = new ethers.Wallet((global as any).environment.PRI_KEY);
  const signer = wallet.connect(network?.provider);
  const signature = await signer._signTypedData(domain, types, values);
  return signature;
};

export const getExpiry = function () {
  return moment().utc().add("minutes", 15).unix();
};
