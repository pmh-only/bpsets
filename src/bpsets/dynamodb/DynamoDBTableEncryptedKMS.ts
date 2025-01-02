import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  UpdateTableCommand,
} from '@aws-sdk/client-dynamodb';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class DynamoDBTableEncryptedKMS implements BPSet {
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
    name: 'DynamoDBTableEncryptedKMS',
    description: 'Ensures that DynamoDB tables are encrypted with AWS KMS.',
    priority: 2,
    priorityReason: 'Encrypting DynamoDB tables with KMS enhances data security and meets compliance requirements.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'kms-key-id',
        description: 'The ID of the KMS key used to encrypt the DynamoDB table.',
        default: '',
        example: 'arn:aws:kms:us-east-1:123456789012:key/abcd1234-5678-90ef-ghij-klmnopqrstuv',
      },
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'Retrieve the list of DynamoDB tables to verify encryption settings.',
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Fetch details of each DynamoDB table, including SSE configuration.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateTableCommand',
        reason: 'Enable KMS encryption for non-compliant DynamoDB tables.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure the specified KMS key is accessible and meets your security policies.',
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
      if (
        table.SSEDescription?.Status === 'ENABLED' &&
        table.SSEDescription?.SSEType === 'KMS'
      ) {
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const kmsKeyId = requiredParametersForFix.find((param) => param.name === 'kms-key-id')?.value;

    if (!kmsKeyId) {
      throw new Error("Required parameter 'kms-key-id' is missing.");
    }

    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!;

      await this.client.send(
        new UpdateTableCommand({
          TableName: tableName,
          SSESpecification: {
            Enabled: true,
            SSEType: 'KMS',
            KMSMasterKeyId: kmsKeyId,
          },
        })
      );
    }
  };
}
