import {
  AutoScalingClient,
  DescribeAutoScalingGroupsCommand,
  UpdateAutoScalingGroupCommand
} from '@aws-sdk/client-auto-scaling'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class AutoScalingGroupELBHealthCheckRequired implements BPSet {
  private readonly client = new AutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAutoScalingGroups = async () => {
    const response = await this.memoClient.send(new DescribeAutoScalingGroupsCommand({}))
    return response.AutoScalingGroups || []
  }

  public readonly getMetadata = () => ({
    name: 'AutoScalingGroupELBHealthCheckRequired',
    description: 'Ensures that Auto Scaling groups with ELB or Target Groups use ELB health checks.',
    priority: 2,
    priorityReason: 'ELB health checks ensure accurate instance health monitoring in Auto Scaling groups.',
    awsService: 'Auto Scaling',
    awsServiceCategory: 'Compute',
    bestPracticeCategory: 'Resilience',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeAutoScalingGroupsCommand',
        reason: 'Retrieve Auto Scaling groups to check health check type.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateAutoScalingGroupCommand',
        reason: 'Set the health check type to ELB for Auto Scaling groups.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure that the Auto Scaling group is associated with a functional ELB or Target Group.'
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
    const asgs = await this.getAutoScalingGroups()

    for (const asg of asgs) {
      if ((asg.LoadBalancerNames?.length || asg.TargetGroupARNs?.length) && asg.HealthCheckType !== 'ELB') {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        compliantResources.push(asg.AutoScalingGroupARN!)
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
    for (const asgArn of nonCompliantResources) {
      const asgName = asgArn.split(':').pop()!
      await this.client.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: asgName,
          HealthCheckType: 'ELB'
        })
      )
    }
  }
}
