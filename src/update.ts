import { existsSync } from 'fs-extra'
import { readConfig } from './config'
import { fetchJson } from './fetch'
import {
  apiDescriptionFilePath,
  apisFilePath,
  initFilePath,
  serviceDescriptionFilePath,
  serviceFilePath,
  writeToFile,
} from './file'
import { convertApiToService, convertBodyToString, generateCommonComment, removeJsConvertSymbols, wrapNewline } from './utils'
import {
  apiDescriptionFileTemplate,
  apisFileTemplate,
  servicesFileTemplate,
  requestAndResponseMapTemplate,
  apiDescTemplate,
  serviceDescriptionFileTemplate,
} from './template'
import { converJSONSchemaToTypescriptStruct } from './utils'

interface UpdateArgs {
  overwrite: boolean
  usingJs: boolean
}

// 更新数据
export async function update({ overwrite, usingJs = false }: UpdateArgs) {
  const config = readConfig()
  if (config) {
    initFilePath(config.outputPath)
    const apiJson = await fetchJson(config)
    if (typeof apiJson !== 'undefined') {
      // 初始化service目录的相关文件的存储路径
      // 根据api获取service配置数据
      const services = convertApiToService(apiJson, config)
      // yapi.services.ts文件名称
      const serviceFileName = usingJs ? serviceFilePath.replace(/\.ts$/, '.js') : serviceFilePath
      // 根据配置项来判断是否覆盖yapi.services.ts文件
      if (config.overwrite !== false || !existsSync(serviceFileName)) {
        // 生成yapi.services.ts文件
        await writeToFile(serviceFileName, removeJsConvertSymbols(servicesFileTemplate, usingJs), undefined, overwrite)
        // js项目还需要生成yapi.services.d.ts文件
        if (usingJs) {
          await writeToFile(serviceDescriptionFilePath, serviceDescriptionFileTemplate, undefined, overwrite)
        }
      }
      // 生成yapi.api.d.ts文件
      const serviceKeys = Object.keys(services)
      await writeToFile(
        apiDescriptionFilePath,
        apiDescriptionFileTemplate.replace(
          '$$1',
          serviceKeys
            .reduce<string[]>((arr, key) => {
              const api = services[key]
              arr.push(
                requestAndResponseMapTemplate
                  .replace('$$k', key)
                  // params
                  .replace(
                    '$$p',
                    wrapNewline(
                      api.params
                        ?.map(p => {
                          return `${generateCommonComment(p)}${p.name}: any;`
                        })
                        .join('\n'),
                      4
                    ) ?? ''
                  )
                  // query
                  .replace(
                    '$$q',
                    wrapNewline(
                      api.query
                        ?.map(q => {
                          return `${generateCommonComment(q)}${q.name}${Number(q.required) > 0 ? '' : '?'}: any;`
                        })
                        .join('\n'),
                      4
                    ) ?? ''
                  )
                  // body
                  .replace('$$b', convertBodyToString(api, 4) ?? '')
                  // response
                  .replace('$$r', converJSONSchemaToTypescriptStruct(api.resp || {}, 4))
              )
              return arr
            }, [])
            .join('\n  ')
        ),
        undefined,
        overwrite
      )
      // 生成yapi.apis.ts文件
      await writeToFile(
        usingJs ? apisFilePath.replace(/\.ts$/, '.js') : apisFilePath,
        removeJsConvertSymbols(
          apisFileTemplate.replace(
            '$$1',
            serviceKeys
              .map(key => {
                const api = services[key]
                return apiDescTemplate
                  .replace('$$k', key)
                  .replace('$$u', api.url)
                  .replace('$$m', api.method)
                  .replace(
                    '$$p',
                    api.params?.length ? `p: ['${api.params.map(param => param.name).join("', '")}'],\n    ` : ''
                  )
                  .replace('$$q', api.query?.length ? `q: ['${api.query.map(q => q.name).join("', '")}'],\n    ` : '')
                  .replace('$$d', api.done ? '1' : '0')
              })
              .join(',\n  ')
          ),
          usingJs
        ),
        undefined,
        overwrite
      )
      console.log('Done!')
    }
  }
}
