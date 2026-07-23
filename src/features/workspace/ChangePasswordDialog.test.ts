import { describe, expect, it } from 'vitest'
import { ApiException } from '../../api/client'
import { isSessionExpired } from '../../api/errors'
import { changePasswordErrorText, passwordFormError, MIN_PASSWORD_LENGTH } from './ChangePasswordDialog'

describe('passwordFormError', () => {
  it('要求填当前密码', () => {
    expect(passwordFormError('', 'longenough1', 'longenough1')).toBe('请输入当前密码')
  })

  it('新密码短于下限时拒绝，且不发请求', () => {
    expect(passwordFormError('old-pass', 'short', 'short')).toBe(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`)
  })

  it('两次输入不一致时拒绝', () => {
    expect(passwordFormError('old-pass', 'longenough1', 'longenough2'))
      .toBe('两次输入的新密码不一致')
  })

  it('新旧密码相同时拒绝', () => {
    expect(passwordFormError('longenough1', 'longenough1', 'longenough1'))
      .toBe('新密码不能和当前密码相同')
  })

  it('合法输入放行', () => {
    expect(passwordFormError('old-pass', 'longenough1', 'longenough1')).toBeNull()
  })

  it('恰好等于下限位数的新密码放行', () => {
    const exact = 'a'.repeat(MIN_PASSWORD_LENGTH)
    expect(passwordFormError('old-pass', exact, exact)).toBeNull()
  })
})

describe('changePasswordErrorText', () => {
  it('把 403 PASSWORD_MISMATCH 翻成人话', () => {
    expect(changePasswordErrorText(new ApiException(403, 'PASSWORD_MISMATCH')))
      .toBe('当前密码不对，请重新输入')
  })

  it('把后端 VALIDATION_ERROR 归到长度提示', () => {
    expect(changePasswordErrorText(new ApiException(400, 'VALIDATION_ERROR')))
      .toBe(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`)
  })

  it('401 不当成表单错误——它走会话失效那条路', () => {
    expect(isSessionExpired(new ApiException(401, 'AUTH_INVALID_TOKEN'))).toBe(true)
  })

  it('其他错误不会被误判成会话失效', () => {
    expect(isSessionExpired(new ApiException(403, 'PASSWORD_MISMATCH'))).toBe(false)
    expect(isSessionExpired(new Error('network down'))).toBe(false)
  })

  it('网络错误等未知情况给可操作兜底', () => {
    expect(changePasswordErrorText(new Error('network down')))
      .toBe('修改失败，请检查网络后重试')
  })
})
