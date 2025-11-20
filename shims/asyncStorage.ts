const memory: Record<string, string> = {};

async function setItem(key: string, value: string): Promise<void> {
	if (typeof window !== "undefined" && window?.localStorage) {
		window.localStorage.setItem(key, value);
		return;
	}
	memory[key] = value;
}

async function getItem(key: string): Promise<string | null> {
	if (typeof window !== "undefined" && window?.localStorage) {
		return window.localStorage.getItem(key);
	}
	return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
}

async function removeItem(key: string): Promise<void> {
	if (typeof window !== "undefined" && window?.localStorage) {
		window.localStorage.removeItem(key);
		return;
	}
	delete memory[key];
}

export default { setItem, getItem, removeItem };


