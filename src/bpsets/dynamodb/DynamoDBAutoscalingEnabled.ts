import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand
} from '@aws-sdk/client-dynamodb'
import {
  ApplicationAutoScalingClient,
  RegisterScalableTargetCommand,
  PutScalingPolicyCommand,
  DescribeScalingPoliciesCommand
} from '@aws-sdk/client-application-auto-scaling'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class DynamoDBAutoscalingEnabled implements BPSet {
  private readonly client = new DynamoDBClient({})
  private readonly autoScalingClient = new ApplicationAutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getTables = async () => {
    const tableNames = await this.memoClient.send(new ListTablesCommand({}))
    const tables = []
    for (const tableName of tableNames.TableNames || []) {
      const tableDetails = await this.memoClient.send(
        new DescribeTableCommand({ TableName: tableName })
      )
      tables.push(tableDetails.Table!)
    }
    return tables
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const tables = await this.getTables()

    for (const table of tables) {
      if (table.BillingModeSummary?.BillingMode === 'PAY_PER_REQUEST') {
        compliantResources.push(table.TableArn!)
        continue
      }

      const scalingPolicies = await this.autoScalingClient.send(
        new DescribeScalingPoliciesCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${table.TableName}`
        })
      )
      const scalingPolicyDimensions = scalingPolicies.ScalingPolicies?.map(
        policy => policy.ScalableDimension
      )

      if (
        scalingPolicyDimensions?.includes('dynamodb:table:ReadCapacityUnits') &&
        scalingPolicyDimensions?.includes('dynamodb:table:WriteCapacityUnits')
      ) {
        compliantResources.push(table.TableArn!)
      } else {
        nonCompliantResources.push(table.TableArn!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const tableName = arn.split('/').pop()!

      // Register scalable targets for read and write capacity
      await this.autoScalingClient.send(
        new RegisterScalableTargetCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:ReadCapacityUnits',
          MinCapacity: 1,
          MaxCapacity: 100
        })
      )

      await this.autoScalingClient.send(
        new RegisterScalableTargetCommand({
          ServiceNamespace: 'dynamodb',
          ResourceId: `table/${tableName}`,
          ScalableDimension: 'dynamodb:table:WriteCapacityUnits',
          MinCapacity: 1,
          MaxCapacity: 100
        })
      )

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
              PredefinedMetricType: 'DynamoDBReadCapacityUtilization'
            }
          }
        })
      )

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
              PredefinedMetricType: 'DynamoDBWriteCapacityUtilization'
            }
          }
        })
      )
    }
  }
}
