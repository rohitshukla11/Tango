import { useCallback } from "react";
import { uploadFile, uploadJSON, getFile, payForStorage } from "../../lib/filecoin";

export function useFilecoin() {
	const uploadFileCb = useCallback(uploadFile, []);
	const uploadJSONCb = useCallback(uploadJSON, []);
	const getFileCb = useCallback(getFile, []);
	const payCb = useCallback(payForStorage, []);
	return {
		uploadFile: uploadFileCb,
		uploadJSON: uploadJSONCb,
		getFile: getFileCb,
		payForStorage: payCb
	};
}


