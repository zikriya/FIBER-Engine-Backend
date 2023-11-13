import {
  produecSignaturewithdrawHash,
  fixSig,
} from "../../../../scripts/utils/BridgeUtils";
import { ecsign, toRpcSig } from "ethereumjs-util";
import Web3 from "web3";

interface SignatureResponse {
  hash: String;
  salt: String;
  signature: String;
  amount: String;
}

module.exports = {
  getSignature: async function (
    paramsBody: any,
    assetType: String
  ): Promise<SignatureResponse> {
    let signatureResponse: SignatureResponse = {
      hash: "",
      salt: "",
      signature: "",
      amount: "",
    };
    if (
      paramsBody &&
      paramsBody.salt &&
      paramsBody.hash &&
      paramsBody.signatures
    ) {
      signatureResponse.hash = paramsBody.hash;
      signatureResponse.salt = paramsBody.salt;
      signatureResponse.amount = paramsBody.destinationBridgeAmount;
      if (assetType == (global as any).utils.assetType.FOUNDARY) {
        signatureResponse.signature =
          paramsBody.signatures.length > 0 ? paramsBody.signatures[0] : "";
      } else {
        signatureResponse.signature =
          paramsBody.signatures.length > 0 ? paramsBody.signatures[1] : "";
      }
    }
    return signatureResponse;
  },
};
