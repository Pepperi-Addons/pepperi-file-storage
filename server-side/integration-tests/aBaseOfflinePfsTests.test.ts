import { ABasePfsTests } from "./aBasePfsTests.test";


export abstract class ABaseOfflinePfsTests extends ABasePfsTests
{
	protected readonly pfsSchemaName = `PfsOfflineTest`;
	protected readonly onlineTestFileName = 'test.png';
	protected readonly offlineTestFileName = 'offlineTest.png';
}
