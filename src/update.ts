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
import { convertApiToService, removeJsConvertSymbols } from './utils'
import {
  apiDescriptionFileTemplate,
  apisFileTemplate,
  servicesFileTemplate,
  requestAndResponseMapTemplate,
  apiDescTemplate,
  serviceDescriptionFileTemplate,
} from './template'
import { converJSONSchemaToResponseStruct, wrapSpace } from './utils'

const FormTypeMap = { text: 'string | number | boolean', file: 'File' }

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
      const services = convertApiToService(apiJson)
      // 生成yapi.services.ts文件
      await writeToFile(
        usingJs ? serviceFilePath.replace(/\.ts$/, '.js') : serviceFilePath,
        removeJsConvertSymbols(servicesFileTemplate, usingJs),
        undefined,
        overwrite
      )
      // js项目还需要生成yapi.services.d.ts文件
      if (usingJs) {
        await writeToFile(serviceDescriptionFilePath, serviceDescriptionFileTemplate, undefined, overwrite)
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
                  .replace('$$p', wrapSpace(api.params?.map(p => `${p}: any;`).join(' ')) ?? '')
                  .replace(
                    '$$q',
                    wrapSpace(api.query?.map(q => `${q.name}${q.required ? '' : '?'}: any;`).join(' ')) ?? ''
                  )
                  .replace(
                    '$$b',
                    wrapSpace(
                      api.body
                        ?.map(b => `${b.name}${b.required ? '' : '?'}: ${FormTypeMap[b.type] ?? 'any'}`)
                        .join('; ')
                    ) ?? ''
                  )
                  .replace('$$r', converJSONSchemaToResponseStruct(api.resp || {}))
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
                  .replace('$$p', api.params?.length ? `p: ['${api.params.join("', '")}'],\n    ` : '')
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
