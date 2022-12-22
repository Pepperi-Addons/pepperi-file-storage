export default interface ICommand 
{
	execute(): Promise<any>;
}
