export interface PreSyncResult {
    /**
     * In case of Success is false, sync process will not start.
     */
    Success: boolean,
    /**
     * In case of Success is false, this message will be written to the log.
     * In case of Success is true, this message will be ignored.
     */
    Message?: string
}
