import {
  ApiGatewayV2Client,
  AuthorizationType,
  GetApisCommand,
  GetRoutesCommand,
  UpdateRouteCommand
} from '@aws-sdk/client-apigatewayv2'
import { BPSet, BPSetFixFn, BPSetStats } from '../../types'
import { Memorizer } from '../../Memorizer'

export class APIGatewayV2AuthorizationTypeConfigured implements BPSet {
  private readonly client = new ApiGatewayV2Client({})
  private readonly memoClient = Memorizer.memo(this.client)

  private readonly getHttpApis = async () => {
    const response = await this.memoClient.send(new GetApisCommand({}))
    return response.Items || []
  }

  private readonly getRoutes = async (apiId: string) => {
    const response = await this.memoClient.send(new GetRoutesCommand({ ApiId: apiId }))
    return response.Items || []
  }

  public readonly getMetadata = () => ({
    name: 'APIGatewayV2AuthorizationTypeConfigured',
    description: 'Ensures that authorization type is configured for API Gateway v2 routes.',
    priority: 2,
    priorityReason: 'Configuring authorization ensures API security by restricting unauthorized access.',
    awsService: 'API Gateway',
    awsServiceCategory: 'API Management',
    bestPracticeCategory: 'Security',
    requiredParametersForFix: [
      {
        name: 'authorization-type',
        description: 'The authorization type to configure for the routes.',
        default: '',
        example: 'JWT'
      }
    ],
    isFixFunctionUsesDestructiveCommand: false,
    commandUsedInCheckFunction: [
      {
        name: 'GetRoutesCommand',
        reason: 'Verify if authorization type is configured for API Gateway routes.'
      }
    ],
    commandUsedInFixFunction: [
      {
        name: 'UpdateRouteCommand',
        reason: 'Set the authorization type for API Gateway routes.'
      }
    ],
    adviseBeforeFixFunction: 'Ensure the chosen authorization type aligns with application requirements.'
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
    const apis = await this.getHttpApis()

    for (const api of apis) {
      const routes = await this.getRoutes(api.ApiId!)
      for (const route of routes) {
        const routeIdentifier = `${api.Name!} / ${route.RouteKey!}`
        if (route.AuthorizationType === 'NONE') {
          nonCompliantResources.push(routeIdentifier)
        } else {
          compliantResources.push(routeIdentifier)
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

  public readonly fixImpl: BPSetFixFn = async (nonCompliantResources, requiredParametersForFix) => {
    const authorizationType = requiredParametersForFix.find((param) => param.name === 'authorization-type')?.value

    if (!authorizationType) {
      throw new Error("Required parameter 'authorization-type' is missing.")
    }

    for (const resource of nonCompliantResources) {
      const [apiName, routeKey] = resource.split(' / ')
      const api = (await this.getHttpApis()).find((a) => a.Name === apiName)

      if (!api) continue

      const routes = await this.getRoutes(api.ApiId!)
      const route = routes.find((r) => r.RouteKey === routeKey)

      if (!route) continue

      await this.client.send(
        new UpdateRouteCommand({
          ApiId: api.ApiId!,
          RouteId: route.RouteId!,
          AuthorizationType: authorizationType as AuthorizationType
        })
      )
    }
  }
}
