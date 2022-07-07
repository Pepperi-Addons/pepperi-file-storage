export interface ITransactionalCommand
{
    preLockValidations(): Promise<void>;
    lock(): Promise<void>;
    executeTransaction(): Promise<any>;
    rollback(lockedFile: any): Promise<void>;
    unlock(key: string): Promise<void>;
}