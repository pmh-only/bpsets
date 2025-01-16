import { DescribeInstancesCommand, EC2Client, MonitorInstancesCommand } from '@aws-sdk/client-ec2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class EC2InstanceDetailedMonitoringEnabled implements BPSet {
  private readonly client = new EC2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  public readonly getMetadata = () => ({
    name: 'EC2InstanceDetailedMonitoringEnabled',
    description: 'Ensures that EC2 instances have detailed monitoring enabled.',
    priority: 2,
    priorityReason: 'Detailed monitoring provides enhanced visibility into instance performance metrics.',
    awsService: 'EC2',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Monitoring and Logging',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeInstancesCommand',
        reason: 'Retrieve the list of all EC2 instances and their monitoring state.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'MonitorInstancesCommand',
        reason: 'Enable detailed monitoring for non-compliant EC2 instances.'
      }
    ],
    adviseBeforeFixFunction:
      'Ensure enabling detailed monitoring aligns with organizational policies and cost considerations.'
  })

  private readonly stats: BPSetStats = {
    nonCompliantResources: [],
    compliantResources: [],
    status: 'LOADED',
    errorMessage: []
  }

  public readonly getStats = () => this.stats

  public readonly clearStats = () => {
    this.stats.compliantResources = []
    this.stats.nonCompliantResources = []
    this.stats.status = 'LOADED'
    this.stats.errorMessage = []
  }

  public readonly check = async () => {
    this.stats.status = 'CHECKING'

    await this.checkImpl().then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const response = await this.memoClient.send(new DescribeInstancesCommand({}))

    for (const reservation of response.Reservations || []) {
      for (const instance of reservation.Instances || []) {
        if (instance.State?.Name === 'terminated') continue

        if (instance.Monitoring?.State === 'enabled') {
          compliantResources.push(instance.InstanceId!)
        } else {
          nonCompliantResources.push(instance.InstanceId!)
        }
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err.message
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources) => {
    if (nonCompliantResources.length > 0) {
      await this.client.send(
        new MonitorInstancesCommand({
          InstanceIds: nonCompliantResources
        })
      )
    }
  }
}
