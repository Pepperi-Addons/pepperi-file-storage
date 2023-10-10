import { AddonDataScheme, PapiClient } from "@pepperi-addons/papi-sdk";

import { ArbitraryPrefix } from "../constants";
import { AddonUUID } from "../../../addon.config.json";


/**
 * A service for the arbitrary prefix
 * The arbitrary prefix is a string that is added to the beginning of the file name.
 * It is used to make sure that the file names are unique between different runs of the tests suite,
 * but identical within a single run.
 */
export class ArbitraryPrefixService
{
	protected readonly SCHEMA_NAME = "ArbitraryPrefixSchema";
	protected readonly KEY_NAME = "ArbitraryPrefixKey";

	protected _prefix: string | undefined;

	constructor(protected papiClient: PapiClient)
	{}

	/**
     * Add the arbitrary prefix to a string
     * @param { string } str - The string to add the prefix to
     * @returns { string } - The string with the prefix
     * @throws { Error } - If the prefix is not initialized
     */
	public async addPrefixToString(str: string): Promise<string>
	{
		if(!this._prefix)
		{
			const arbitraryPrefix: ArbitraryPrefix = await this.papiClient.addons.data.uuid(AddonUUID).table(this.SCHEMA_NAME).key(this.KEY_NAME).get() as ArbitraryPrefix;
			this._prefix = arbitraryPrefix.ArbitraryPrefixValue;
		}

		return `${this._prefix}${str}`;
	}

	/**
     * Initialize the arbitrary prefix service
     * Create a schema and save a prefix to it
     *
     * This method should be called once and only once prior to each run of the tests suite.
     * @returns { ArbitraryPrefix } - The saved prefix
     */
	public async init(): Promise<ArbitraryPrefix>
	{
		// Create an arbitrary prefix schema
		await this.createSchema();

		const prefix = this.generatePrefix();

		// Create an arbitrary prefix file
		return await this.savePrefix(prefix);
	}

	/**
     * Create a schema for the arbitrary prefix
     * @returns 
     */
	protected async createSchema(): Promise<AddonDataScheme>
	{
		const schema: AddonDataScheme = {
			Name: this.SCHEMA_NAME,
			Type: "data",
			Fields: {
				"Key": {
					"Type": "String",
				},
				"ArbitraryPrefixValue": {
					"Type": "String",
				},
			},
		};

		return await this.papiClient.addons.data.schemes.post(schema);
	}

	/**
     * Generate an arbitrary prefix.
     * This function uses the current time as the prefix.
     * @returns { string } - The generated prefix
     */
	protected generatePrefix(): string
	{
		return new Date().getTime().toString();
	}

	/**
     * Save the arbitrary prefix to the schema
     * @param { string } prefix - The prefix to save
     * @returns { ArbitraryPrefix } - The saved prefix
     */
	protected async savePrefix(prefix: string): Promise<ArbitraryPrefix>
	{
		const arbitraryPrefix: ArbitraryPrefix = {
			Key: this.KEY_NAME,
			ArbitraryPrefixValue: prefix,
		};

		return await this.papiClient.addons.data.uuid(AddonUUID).table(this.SCHEMA_NAME).upsert(arbitraryPrefix) as ArbitraryPrefix;
	}
}
