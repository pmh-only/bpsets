import { RDSClient, DescribeDBInstancesCommand, ModifyDBInstanceCommand } from '@aws-sdk/client-rds'
import { BPSet, BPSetMetadata, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class DBInstanceBackupEnabled implements BPSet {
  private readonly client = new RDSClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly stats: BPSetStats = {
    compliantResources: [],
    nonCompliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getMetadata = (): BPSetMetadata => ({
    name: 'DBInstanceBackupEnabled',
    description: 'Ensures that backups are enabled for RDS instances.',
    priority: 1,
    priorityReason: 'Enabling backups is critical for data recovery and compliance.',
    awsService: 'RDS',
    awsServiceCategory: 'Database',
    bestPracticeCategory: 'Data Protection',
    requiredParametersForFix: [
      {
        name: 'retention-period',
        description: 'The number of days to retain backups.',
        default: '7',
        example: '7'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeDBInstancesCommand',
        reason: 'Fetch information about RDS instances to check backup retention.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyDBInstanceCommand',
        reason: 'Enable backup retention for non-compliant RDS instances.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the retention period aligns with your organization’s backup policy.'
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
      if (instance.BackupRetentionPeriod && instance.BackupRetentionPeriod > 0) {
        compliantResources.push(instance.DBInstanceArn!)
      } else {
        nonCompliantResources.push(instance.DBInstanceArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    await this.fixImpl(nonCompliantResources, requiredParametersForFix)
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

  private readonly fixImpl = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const retentionPeriod = requiredParametersForFix.find((param) => param.name === 'retention-period')?.value

    if (!retentionPeriod) {
      throw new Error("Required parameter 'retention-period' is missing.")
    }

    for (const arn of nonCompliantResources) {
      const instanceId = arn.split(':instance/')[1]
      await this.client.send(
        new ModifyDBInstanceCommand({
          DBInstanceIdentifier: instanceId,
          BackupRetentionPeriod: parseInt(retentionPeriod, 10)
        })
      )
    }
  }

  private readonly getDBInstances = async () => {
    const response = await this.memoClient.send(new DescribeDBInstancesCommand({}))
    return response.DBInstances || []
  }
}
