import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <Alert className="border-amber-700/30 bg-amber-50 text-foreground">
      <ShieldAlert className="text-amber-800" />
      <AlertTitle>不是投资建议</AlertTitle>
      <AlertDescription>
        这是给小白练纪律的纸上作战台，不接券商、不下实盘单，也不保证收益。A
        股短线没有稳赚模型。硬规则变严，是为了挡住追高、爆量和没有空间的结构，不是把胜率变成可承诺的数字。正常模式下价格来自腾讯财经公开延迟日K，由本机
        Next 服务端代拉（Chrome 直连 web.ifzq.gtimg.cn 常返回 501）；只有拉失败或你切离线演示时才用本地模拟名单。不能代替你自己的判断。
      </AlertDescription>
    </Alert>
  );
}
