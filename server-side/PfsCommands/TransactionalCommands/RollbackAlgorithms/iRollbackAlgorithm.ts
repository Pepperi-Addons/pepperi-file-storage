export interface IRollbackAlgorithm
{
    /**
     * Perform a rollback of the transaction.
     * @param force If true, the rollback will be performed even if the lock is not expired.
     */
    rollback(force? : boolean): Promise<void>;
}