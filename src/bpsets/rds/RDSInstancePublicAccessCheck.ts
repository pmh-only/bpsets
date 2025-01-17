import { RDSClient, DescribeDBInstancesCommand, ModifyDBInstanceCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class RDSInstancePublicAccessCheck implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'RDSInstancePublicAccessCheck',
    description: 'Ensures RDS instances are not publicly accessible.',
    priority: 1,
    priorityReason: 'Publicly accessible RDS instances expose databases to potential security risks.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBInstancesCommand',
        reason: 'Fetches the list of RDS instances and their public access settings.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBInstanceCommand',
        reason: 'Disables public access for non-compliant RDS instances.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure there are valid private network configurations in place before disabling public access.'
  })

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl()
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const dbInstances = await this.getDBInstances()

    for (const instance of dbInstances) {
      if (instance.PubliclyAccessible) {
        nonCompliantResources.push(instance.DBInstanceArn!)
      } else {
        compliantResources.push(instance.DBInstanceArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
    this.stats.status = 'CHECKING'

    await this.fixImpl(nonCompliantResources)
      .then(() => {
        this.stats.status = 'FINISHED'
      })
      .catch((err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      })
  }

  private readonly fixImpl = async (nonCompliantResources: string[]) => {
    for (const arn of nonCompliantResources) {
      const instanceId = arn.split(':instance/')[1]

      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          PubliclyAccessible: false
        })
      )
    }
  }

  private readonly getDBInstances = async () => {
    const response = await this.memoClient.send(new DescribeDBInstancesCommand({}))
    return response.DBInstances || []
  }
}
