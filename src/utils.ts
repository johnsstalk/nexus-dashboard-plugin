/** Check if a path already has a file extension */
export function hasExtension(path: string): boolean {
	return /\.\w{1,10}$/.test(path);
}

/** Auto-append .md to extension-free paths */
export function ensureExtension(path: string): string {
	return hasExtension(path) ? path : path + ".md";
}
