import 'mocha';
import chai, { expect } from 'chai';
import promised from 'chai-as-promised';
import { mockClient } from './consts';
import { Client, Request } from "@pepperi-addons/debug-server";
import { PapiClient } from '@pepperi-addons/papi-sdk';
import { PfsSchemeService } from '../pfs-scheme.service';
import { Helper } from '../helper';
import { pfsSchemaData } from '../constants';

chai.use(promised);

describe('Schema operations', async () => {

    const request: Request = {
        method: 'GET',
        body: {},
        header: {},
        query:
        {}
    }

    let papiPostCounter = 0;

    Helper.validateAddonSecretKey = async (header: any, client: Client, addonUUID:string) => {
        return;
    }
    Helper.createPapiClient = (client: Client, addonUUID:string, addonSecretKey:string) => {
        const papiClient =  new PapiClient({
            baseURL: mockClient.BaseURL,
            token: mockClient.OAuthAccessToken,
            addonUUID: mockClient.AddonUUID,
            actionUUID: mockClient.ActionUUID,
        });

        papiClient.post = async (url: string, body: any) => {
            papiPostCounter++;
            // Don't care
            return;
        }

        papiClient.get = async (url: string ) => {
            throw new Error('Don\'t care...');
        }

        return papiClient;
    }

    it('should create a schema (Don\'t pass SyncData.Sync)', async () => {
        papiPostCounter = 0;
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'pfs',
            Name: 'pfs_test_schema'
        }
        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        const createdSchema = await schemaService.create();
        // Expect 2 calls to papiClient.post. One for the schema and one for the subscription.
        expect(papiPostCounter).to.equal(2);
        expect(createdSchema.Name).to.equal(requestCopy.body.Name);
        expect(createdSchema.Type).to.equal(requestCopy.body.Type);
        expect(createdSchema.Fields).to.deep.equal(pfsSchemaData.Fields);
    });

    it('should create a schema with SyncData.Sync = false', async () => {
        papiPostCounter = 0;
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'pfs',
            Name: 'pfs_test_schema',
            SyncData : 
                {
                    Sync: false
                }
        }

        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        const createdSchema = await schemaService.create();
        // Expect 2 calls to papiClient.post. One for the schema and one for the subscription.
        expect(papiPostCounter).to.equal(2);
        expect(createdSchema.Name).to.equal(requestCopy.body.Name);
        expect(createdSchema.Type).to.equal(requestCopy.body.Type);
        expect(createdSchema.Fields).to.deep.equal(pfsSchemaData.Fields);
        expect(createdSchema.SyncData?.Sync).to.be.false;
    });

    it('should create a schema with SyncData.Sync = true', async () => {
        papiPostCounter = 0;
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'pfs',
            Name: 'pfs_test_schema',
            SyncData : 
                {
                    Sync: true
                }
        }

        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        const createdSchema = await schemaService.create();
        // Expect 2 calls to papiClient.post. One for the schema and one for the subscription.
        expect(papiPostCounter).to.equal(2);
        expect(createdSchema.Name).to.equal(requestCopy.body.Name);
        expect(createdSchema.Type).to.equal(requestCopy.body.Type);
        expect(createdSchema.Fields).to.deep.equal(pfsSchemaData.Fields);
        expect(createdSchema.SyncData?.Sync).to.be.true;
    });

    it('should throw a "Schema of type `pfs` cannot have custom fields." exception', async () => {
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'pfs',
            Name: 'pfs_test_schema',
            Fields: {
                'UnsupportedField': true
            }
        }
        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        await expect(schemaService.create()).to.be.rejectedWith("Schema of type 'pfs' cannot have custom fields.");
    });

    it("The schema must be of type 'pfs'", async () => {
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'NOT_PFS',
            Name: 'pfs_test_schema',
            Fields: {
                'UnsupportedField': true
            }
        }
        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        await expect(schemaService.create()).to.be.rejectedWith("The schema must be of type 'pfs'");
    });

    it("The schema must have a Name property", async () => {
        const requestCopy = { ...request };
        requestCopy.body = {
            Type: 'pfs',
        }
        const schemaService = new PfsSchemeService(mockClient, requestCopy);
        await expect(schemaService.create()).to.be.rejectedWith("The schema must have a Name property");
    });
});
