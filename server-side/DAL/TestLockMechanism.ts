import { TestError } from "pfs-shared";
import { IndexedDataS3PfsDal } from "./IndexedDataS3PfsDal";

export class FailAfterLock extends IndexedDataS3PfsDal{
    public async mutateS3(newFileFields: any, existingFile: any): Promise<any> {
        throw new TestError('Test lock mechanism: Fail after locking file.');
    }
}

export class FailAfterMutatingS3 extends IndexedDataS3PfsDal{
    public async mutateADAL(newFileFields: any, existingFile: any): Promise<any> {
        throw new TestError('Test lock mechanism: Fail after mutating S3.');
        
    }
}

export class FailAfterMutatingAdal extends IndexedDataS3PfsDal{
    public async notify(newFileFields: any, existingFile: any): Promise<void> {
        throw new TestError('Test lock mechanism: Fail after mutating ADAL.');
    }
}