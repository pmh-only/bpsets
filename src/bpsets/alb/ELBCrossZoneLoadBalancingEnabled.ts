import {
  ElasticLoadBalancingV2Client,
  DescribeLoadBalancersCommand,
  DescribeLoadBalancerAttributesCommand,
  ModifyLoadBalancerAttributesCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';
import { BPSet, BPSetFixFn, BPSetStats } from '../../types';
import { Memorizer } from '../../Memorizer';

export class ELBCrossZoneLoadBalancingEnabled implements BPSet {
  private readonly client = new ElasticLoadBalancingV2Client({});
  private readonly memoClient = Memorizer.memo(this.client);

  private readonly getLoadBalancers = async () => {
    const response = await this.memoClient.send(new DescribeLoadBalancersCommand({}));
    return response.LoadBalancers || [];
  };

  private readonly getLoadBalancerAttributes = async (loadBalancerArn: string) => {
    const response = await this.memoClient.send(
      new DescribeLoadBalancerAttributesCommand({ LoadBalancerArn: loadBalancerArn })
    );
    return response.Attributes || [];
  };

  public readonly getMetadata = () => ({
    name: 'ELBCrossZoneLoadBalancingEnabled',
    description: 'Ensures that cross-zone load balancing is enabled for Elastic Load Balancers.',
    priority: 2,
    priorityReason: 'Cross-zone load balancing helps evenly distribute traffic, improving resilience.',
    awsService: 'Elastic Load Balancing',
    awsServiceCategory: 'Classic Load Balancer',
    bestPracticeCategory: 'Performance',
    requiredParametersForFix: [],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'DescribeLoadBalancerAttributesCommand',
        reason: 'Verify if cross-zone load balancing is enabled for ELBs.',
      },
    ],
    commandUsedInFixFunction: [
      {
        name: 'ModifyLoadBalancerAttributesCommand',
        reason: 'Enable cross-zone load balancing for ELBs.',
      },
    ],
    adviseBeforeFixFunction: 'Ensure this setting aligns with your traffic distribution requirements.',
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
    const loadBalancers = await this.getLoadBalancers();

    for (const lb of loadBalancers) {
      const attributes = await this.getLoadBalancerAttributes(lb.LoadBalancerArn!);
      const isEnabled = attributes.some(
        (attr) =>
          attr.Key === 'load_balancing.cross_zone.enabled' && attr.Value === 'true'
      );

      if (isEnabled) {
        compliantResources.push(lb.LoadBalancerArn!);
      } else {
        nonCompliantResources.push(lb.LoadBalancerArn!);
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
    for (const lbArn of nonCompliantResources) {
      await this.client.send(
        new ModifyLoadBalancerAttributesCommand({
          LoadBalancerArn: lbArn,
          Attributes: [{ Key: 'load_balancing.cross_zone.enabled', Value: 'true' }],
        })
      );
    }
  };
}
