import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2'
import { WAFV2Client, GetWebACLForResourceCommand, AssociateWebACLCommand } from '@aws-sdk/client-wafv2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class ALBWAFEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)
  private readonly wafClient = Memorizer.memo(new WAFV2Client({}))

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}))
    return response.LoadBalancers || []
  }

  public readonly getMetadata = () => ({
    name: 'ALBWAFEnabled',
    description: 'Ensures that WAF is associated with ALBs.',
    priority: 1,
    priorityReason: 'Associating WAF with ALBs protects against common web attacks.',
    awsService: 'Elastic Load Balancing',
    awsServiceCategory: 'Application Load Balancer',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'web-acl-arn',
        description: 'The ARN of the WAF ACL to associate with the ALB.',
        default: '',
        example: 'arn:aws:wafv2:us-east-1:123456789012:regional/webacl/example'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetWebAclForResourceCommand',
        reason: 'Check if a WAF is associated with the ALB.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'AssociateWebAclCommand',
        reason: 'Associate a WAF ACL with the ALB.'
      }
    ],
    adviseBeforeFixFunction: "Ensure the WAF ACL has the appropriate rules for the application's requirements."
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
          message: err
        })
      }
    )
  }

  private readonly checkImpl = async () => {
    const compliantResources: string[] = []
    const nonCompliantResources: string[] = []
    const loadBalancers = await this.getLoadBalancers()

    for (const lb of loadBalancers) {
      const response = await this.wafClient.send(new GetWebACLForResourceCommand({ ResourceArn: lb.LoadBalancerArn }))
      if (response.WebACL) {
        compliantResources.push(lb.LoadBalancerArn!)
      } else {
        nonCompliantResources.push(lb.LoadBalancerArn!)
      }
    }

    this.stats.compliantResources = compliantResources
    this.stats.nonCompliantResources = nonCompliantResources
    this.stats.status = 'FINISHED'
  }

  public readonly fix: BPSetFixFn = async (...args) => {
    await this.fixImpl(...args).then(
      () => (this.stats.status = 'FINISHED'),
      (err) => {
        this.stats.status = 'ERROR'
        this.stats.errorMessage.push({
          date: new Date(),
          message: err
        })
      }
    )
  }

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const webAclArn = requiredParametersForFix.find((param) => param.name === 'web-acl-arn')?.value

    if (!webAclArn) {
      throw new Error("Required parameter 'web-acl-arn' is missing.")
    }

    for (const lbArn of nonCompliantResources) {
      await this.wafClient.send(
        new AssociateWebACLCommand({
          ResourceArn: lbArn,
          WebACLArn: webAclArn
        })
      )
    }
  }
}
