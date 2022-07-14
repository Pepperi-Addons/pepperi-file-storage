export interface ITransactionalCommand
{
    preLockLogic(): Promise<void>;
    lock(): Promise<void>;
    executeTransaction(): Promise<any>;
    unlock(key: string): Promise<void>;

    // Creating a new concrete class that implements the ITransactionalCommand interface must also 
    // include a new implementation of the IRollbackAlgorithm interface. 
    // This new IRollbackAlgorithm implementation should be added to the
    // RollbackAlgorithmFactory.getRollbackAlgorithm() factory.
}