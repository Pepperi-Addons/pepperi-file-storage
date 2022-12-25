import PfsService from '../pfs.service';

export abstract class AbstractCommand extends PfsService
{
	abstract execute(): Promise<any>;
}

export default AbstractCommand;
