import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  ApplicationAutoScalingClient,
  RegisterScalableTargetCommand,
  PutScalingPolicyCommand,
  DescribeScalingPoliciesCommand,
} from '@aws-sdk/client-application-auto-scaling';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class DynamoDBAutoscalingEnabled implements BPSet {
  private readonly client = new DynamoDBClient({});
  private readonly autoScalingClient = new ApplicationAutoScalingClient({});
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
    name: 'DynamoDBAutoscalingEnabled',
    description: 'Ensures DynamoDB tables have autoscaling enabled for both read and write capacity.',
    priority: 2,
    priorityReason: 'Autoscaling ensures DynamoDB tables dynamically adjust capacity to meet demand, reducing costs and preventing throttling.',
    awsService: 'DynamoDB',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Scalability',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'ListTablesCommand',
        reason: 'List all DynamoDB tables to check their configurations.',
      },
      {
        name: 'DescribeTableCommand',
        reason: 'Retrieve details of DynamoDB tables to analyze billing mode and autoscaling.',
      },
      {
        name: 'DescribeScalingPoliciesCommand',
        reason: 'Fetch scaling policies for each table to check autoscaling settings.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'RegisterScalableTargetCommand',
        reason: 'Register read and write capacity units for autoscaling.',
      },
      {
        name: 'PutScalingPolicyCommand',
        reason: 'Configure target tracking scaling policies for read and write capacity.',
      },
    ],
    adviseBeforeFixFunction:
      'Ensure the table’s read and write workloads are predictable to configure appropriate scaling limits.',
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
      if (table.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST') {
        compliantResources.push(table.TableArn!);
        continue;
      }

      const scalingPolicies = await this.autoScalingClient.send(
        new DescribeScalingPoliciesCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${table.TableName}`,
        })
      );
      const scalingPolicyDimensions = scalingPolicies.ScalingPolicies?.map(
        (policy) => policy.ScalableDimension
      );

      if (
        scalingPolicyDimensions?.includes('dynamodb:table:ReadCapacityUnits') &&
        scalingPolicyDimensions?.includes('dynamodb:table:WriteCapacityUnits')
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!;

      // Register scalable targets for read and write capacity
      await this.autoScalingClient.send(
        new RegisterScalableTargetCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:ReadCapacityUnits',
          MinCapacity: 1,
          MaxCapacity: 100,
        })
      );

      await this.autoScalingClient.send(
        new RegisterScalableTargetCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:WriteCapacityUnits',
          MinCapacity: 1,
          MaxCapacity: 100,
        })
      );

      // Put scaling policies for read and write capacity
      await this.autoScalingClient.send(
        new PutScalingPolicyCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:ReadCapacityUnits',
          PolicyName: `${tableName}-ReadPolicy`,
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            TargetValue: 70.0,
            ScaleInCooldown: 60,
            ScaleOutCooldown: 60,
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'DynamoDBReadCapacityUtilization',
            },
          },
        })
      );

      await this.autoScalingClient.send(
        new PutScalingPolicyCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:WriteCapacityUnits',
          PolicyName: `${tableName}-WritePolicy`,
          PolicyType: 'TargetTrackingScaling',
          TargetTrackingScalingPolicyConfiguration: {
            TargetValue: 70.0,
            ScaleInCooldown: 60,
            ScaleOutCooldown: 60,
            PredefinedMetricSpecification: {
              PredefinedMetricType: 'DynamoDBWriteCapacityUtilization',
            },
          },
        })
      );
    }
  };
}
