param(
  [string]$message = "update"
)
# 一键提交并推送到 GitHub（凭据由 .git-credentials 提供，无需再输 Token）
git add -A
git commit -m $message
git push
