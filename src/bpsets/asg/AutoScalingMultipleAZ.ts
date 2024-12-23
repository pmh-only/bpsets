import { AutoScalingClient, DescribeAutoScalingGroupsCommand, UpdateAutoScalingGroupCommand } from '@aws-sdk/client-auto-scaling'
import { BPSet } from '../BPSet'
import { Memorizer } from '../../Memorizer'

export class AutoScalingMultipleAZ implements BPSet {
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
      if (asg.AvailabilityZones?.length! > 1) {
        compliantResources.push(asg.AutoScalingGroupARN!)
      } else {
        nonCompliantResources.push(asg.AutoScalingGroupARN!)
      }
    }

    return {
      compliantResources,
      nonCompliantResources,
      requiredParametersForFix: [{ name: 'availability-zones' }]
    }
  }

  public readonly fix = async (
    nonCompliantResources: string[],
    requiredParametersForFix: { name: string; value: string }[]
  ) => {
    const availabilityZones = requiredParametersForFix.find(param => param.name === 'availability-zones')?.value

    if (!availabilityZones) {
      throw new Error("Required parameter 'availability-zones' is missing.")
    }

    for (const asgArn of nonCompliantResources) {
      const asgName = asgArn.split(':').pop()!
      await this.client.send(
        new UpdateAutoScalingGroupCommand({
          AutoScalingGroupName: asgName,
          AvailabilityZones: availabilityZones.split(',')
        })
      )
    }
  }
}
