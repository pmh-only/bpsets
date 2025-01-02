import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class DynamoDBTableEncryptionEnabled implements BPSet {
  private readonly client = new DynamoDBClient({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getTables = async () => {
    const tableNames = await this.memoClient.send(new ListTablesCommand({}));
    const tables = [];
    for (const tableName of tableNames.TableNames || []) {
      const tableDetails = await this.memoClient.send(
        new DescribeTableCommand({ TableName: tableName })
      );
      tables.push(tableDetails.Table!);
    }
    return tables;
  };

  public readonly getMetadata = () => ({
    name: 'DynamoDBTableEncryptionEnabled',
    description: 'Ensures that DynamoDB tables have server-side encryption enabled.',
    priority: 3,
    priorityReason: 'Enabling server-side encryption ensures data security and compliance with organizational policies.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'Retrieve the list of DynamoDB tables to verify encryption settings.',
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Fetch details of each DynamoDB table, including encryption settings.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateTableCommand',
        reason: 'Enable server-side encryption for non-compliant DynamoDB tables.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure enabling encryption aligns with organizational data security policies.',
  });

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: [],
  };

  public readonly getStats = () => this.stats;

  public readonly clearStats = () => {
    this.stats.compliantResources = [];
    this.stats.nonCompliantResources = [];
    this.stats.status = 'LOADED';
    this.stats.errorMessage = [];
  };

  public readonly check = async () => {
    this.stats.status = 'CHECKING';

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  private readonly checkImpl = async () => {
    const compliantResources: string[] = [];
    const nonCompliantResources: string[] = [];
    const tables = await this.getTables();

    for (const table of tables) {
      if (table.SSEDescription?.Status === 'ENABLED') {
        compliantResources.push(table.TableArn!);
      } else {
        nonCompliantResources.push(table.TableArn!);
      }
    }

    this.stats.compliantResources = compliantResources;
    this.stats.nonCompliantResources = nonCompliantResources;
  };

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR';
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message,
        });
      }
    );
  };

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!;

      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          SSESpecification: {
            Enabled: true,
          },
        })
      );
    }
  };
}
