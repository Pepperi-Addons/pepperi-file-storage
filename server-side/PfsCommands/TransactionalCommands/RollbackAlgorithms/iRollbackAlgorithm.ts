export interface IRollbackAlgorithm{
    rollback(): Promise<void>;
}