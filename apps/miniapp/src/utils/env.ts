import Taro from '@tarojs/taro'

export const IS_WEAPP = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

export const H5_TABBAR_HEIGHT = 50

export const TAB_PAGE_FOOTER_STYLE = IS_WEAPP ? undefined : { bottom: `${H5_TABBAR_HEIGHT}px` }
