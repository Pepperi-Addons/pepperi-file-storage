import { v4 as createUUID } from 'uuid';

export default class TempFileService {
    constructor(protected distributorUUID: string, protected addonUUID: string, protected environment: string) {}

    public createTempFileKey(fileName?: string): string {
        // /{{distUUID}}/temp/{{randomUUID}}/`FileName ? FileName : createUUID()
        return `${this.distributorUUID}/temp/${createUUID()}/${fileName ? fileName : createUUID()}`;
    }

    public isUrlTempFile(url: string): boolean {
        const 
}
