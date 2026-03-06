
export interface IModule {
    id(): string;
    init(): void;
}

export class ModuleManager {
    private constructor() {
    }
    public static shared = new ModuleManager()
    private moduleMap = new Map<string, IModule>();

    register(module: IModule) {
        this.moduleMap.set(module.id(), module);
        module.init();
    }
    get(id: string): IModule {
        const module = this.moduleMap.get(id);
        if (!module) {
            throw new Error(`Module not found: ${id}`);
        }
        return module;
    }
}


export class Endpoint {
    sid!: string
    category: string
    sort: number
    handler: (param: any) => any;

    constructor(sid: string, handler: (param: any) => any, { category = "", sort = 0 }: { category?: string, sort?: number }) {
        this.sid = sid
        this.handler = handler
        this.category = category
        this.sort = sort
    }
}

export class EndpointManager {
    private constructor() {
    }
    public static shared = new EndpointManager()
    private endpointIDMap = new Map<string, Endpoint>();
    private endpointCategoryMap = new Map<string, Array<Endpoint>>();

    register(endpoint: Endpoint) {
        this.endpointIDMap.set(endpoint.sid, endpoint)
        if (endpoint.category && endpoint.category !== "") {
            let endpoints = this.endpointCategoryMap.get(endpoint.category)
            if (endpoints && endpoints.length > 0) {
                endpoints = endpoints.filter((p) => p.sid !== endpoint.sid)
            } else {
                endpoints = []
            }
            endpoints.push(endpoint);
            this.endpointCategoryMap.set(endpoint.category, endpoints)
        }
    }
    get(sid: string): Endpoint | undefined {
        return this.endpointIDMap.get(sid);
    }
    getWithCategory(category: string): Endpoint[] | undefined {
        const endpoints = this.endpointCategoryMap.get(category);
        endpoints?.sort((a, b) => {
            return a.sort - b.sort;
        });
        return endpoints;
    }
    invoke(sid: string, param?: any) {
        const endpoint = EndpointManager.shared.get(sid);
        if (endpoint?.handler) {
            return endpoint?.handler!(param);
        }
    }
    invokes<T>(category: string, param?: any) {
        const endpoints = EndpointManager.shared.getWithCategory(category);
        const results = new Array<T>();
        if (endpoints && endpoints.length > 0) {
            for (const endpoint of endpoints) {
                const result = endpoint.handler!(param);
                if (result) {
                    results.push(result);
                }
            }
        }
        return results;
    }

    setMethod(sid: string, handler: (param: any) => any, config?: { category?: string, sort?: number }) {
        EndpointManager.shared.register(
            new Endpoint(sid, handler, { category: config?.category, sort: config?.sort || 0 }));
    }

    removeMethod(sid: string) {
        this.endpointIDMap.delete(sid)

       this.endpointCategoryMap.forEach((methods,key)=>{
            for (let index = 0; index < methods.length; index++) {
                const method = methods[index];
                if(method.sid === sid) {
                    methods.splice(index,1)
                }
                
            }
       })
    }
}