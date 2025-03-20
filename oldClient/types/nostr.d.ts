interface NostrProvider {
    /**
     * Get the user's public key from the Nostr extension
     * @returns Promise that resolves to the public key as a hex string
     */
    getPublicKey(): Promise<string>;

    /**
     * Sign an event with the user's private key
     * @param event The event to sign
     * @returns Promise that resolves to the signed event
     */
    signEvent(event: any): Promise<any>;

    /**
     * Get the relay URLs from the extension
     * @returns Promise that resolves to an array of relay URLs
     */
    getRelays?(): Promise<string[]>;
}

declare global {
    interface Window {
        nostr?: NostrProvider;
    }
}

export {};