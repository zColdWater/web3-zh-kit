# 在 Base 上发送 USDC 之前

给新手的 60 秒自检清单。大多数损失发生在交易**之前**，而不是之后。

## 1. 检查网络

确认钱包处于 Base 主网（链 ID `8453`）。把币转到正确的地址、却选错了网络，是最常见的错误。

## 2. 检查地址

- 同时核对地址的前 6 位**和**后 6 位，不要只看开头几位。
- 警惕地址投毒：骗子会用长得很像的地址给你转一笔极小的金额。
- 永远不要从交易记录里复制地址。

## 3. 检查代币

Base 上官方 USDC 合约地址以 https://developers.circle.com/stablecoins/usdc-contract-addresses 公布的为准——其他任何合约都不是 USDC。

```bash
# read the token symbol with cast (Foundry)
cast call 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 "symbol()(string)" --rpc-url https://mainnet.base.org
```

## 4. 检查授权

如果某个网站要求你授权无限额度，立刻停下。定期撤销旧的授权。
