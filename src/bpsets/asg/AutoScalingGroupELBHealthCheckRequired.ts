import { AutoScalingClient, DescribeAutoScalingGroupsCommand, UpdateAutoScalingGroupCommand } from '@aws-sdk/client-auto-scaling'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class AutoScalingGroupELBHealthCheckRequired implements BPSet {
  private readonly client = new AutoScalingClient({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getAutoScalingGroups = async () => {
    const response = await this.memoClient.send(new DescribeAutoScalingGroupsCommand({}))
    return response.AutoScalingGroups || []
  }

  public readonly check = async () => {
    const compliantResources = []
    const nonCompliantResources = []
    const asgs = await this.getAutoScalingGroups()

    for (const asg of asgs) {
      if (
        (asg.LoadBalancerNames?.length || asg.TargetGroupARNs?.length) &&
        asg.HealthCheckType !== 'ELB'
      ) {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        compliantResources.push(asg.AutoScalingGroupARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: []
    }
  }

  public readonly fix = async (nonCompliantResources: string[]) => {
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
