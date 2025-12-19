
export class YanceyID {
    /**
     * 生成下一个 ID 片段
     * 严格只接受 "00100" 或 "00100m" 格式，不接受路径。
     */
    static generate(prevSeg: string | null, nextSeg: string | null): string {
        // 🛡️ 防御性编程：如果有路径分隔符，强行剥离
        if (prevSeg && prevSeg.includes('/')) prevSeg = prevSeg.split('/').pop()!;
        if (nextSeg && nextSeg.includes('/')) nextSeg = nextSeg.split('/').pop()!;

        // Case 1: 首次创建 (!prev && !next)
        if (!prevSeg && !nextSeg) return "00100";

        // Case 2: 尾部追加 (!next) -> prev + 100
        if (!nextSeg) {
            const { num } = this.parse(prevSeg!);
            // 保持步长 100
            return this.format(num + 100);
        }

        // Case 3: 头部插入 (!prev) -> next / 2
        if (!prevSeg) {
            const { num } = this.parse(nextSeg);
            if (num > 1) {
                return this.format(Math.floor(num / 2));
            } else {
                // 逼近绝对零点 00000
                if (num === 1) return "00000";
                // 00000 与 00000 之间的缝隙 (零点溢出)
                return "00000m";
            }
        }

        // Case 4: 中间插入
        const p = this.parse(prevSeg);
        const n = this.parse(nextSeg);

        // 4.1 整数间隙足够
        if (n.num - p.num > 1) {
            return this.format(Math.floor((p.num + n.num) / 2));
        }

        // 4.2 整数无间隙 (后缀逻辑)
        // 只有基数相等时，后缀逻辑才生效；否则 nextSuffix 视为 "无限大"
        // 注意：这里 nextSeg 可能有不同的整数部分（如 00100 vs 00101），但 Diff <= 1 意味着它们是相邻整数
        // 如果是 00100 vs 00101，我们应该生成 00100m 吗？
        // 根据 "Diff <= 1" 条件：
        // 如果 p.num=100, n.num=101. Diff=1.
        // 应该进入后缀逻辑。
        // 我们以 prev 为基准，生成 prev 的后缀。
        // 所以我们比较 p.suffix 和 n.suffix?
        // 不，如果 num 不同，n.suffix 对 p.suffix 来说是 "无限远" 的？
        // 或者说，如果 num 不同，我们其实是在 p.num 的后缀空间里找？
        // 用户逻辑： "Diff <= 1 (无整数空隙) -> 进入 midSuffix(prevSuffix, nextSuffix)"
        // 如果 p.num != n.num (即 p=100, n=101)，则 nSuffix 在比较时应该视为无限大吗？
        // 实际上，如果 p=100, n=101. 我们想要 100m.
        // midSuffix(p.suffix, n.suffix). p.suffix="", n.suffix="" (usually).
        // midSuffix("", "").
        // i=0. Left=97, Right=123 (if nextStr null/empty? No, nextStr is "").
        // Wait, if n.num != p.num, we shouldn't compare suffixes directly because they belong to different bases.
        // The user says "Case 4... Diff <= 1".
        // If p=100, n=101.
        // We want something > 100 and < 101.
        // 100m is > 100 and < 101 (lexicographically 100 < 100m < 101).
        // So effectively we treat next as "infinite" relative to prev's suffix space.
        // So pass null as nextSuffix?
        
        const baseNum = p.num;
        const pSuffix = p.suffix;
        // 如果基数不同 (p=100, n=101)，nextSuffix 不参与比较（视为无限大/null）
        const nSuffix = (n.num === p.num) ? n.suffix : null;

        const newSuffix = this.midSuffix(pSuffix, nSuffix);
        return this.format(baseNum) + newSuffix;
    }

    private static parse(seg: string): { num: number, suffix: string } {
        // 严格匹配 5位数字开头
        const match = seg.match(/^(\d{5})(.*)$/);
        if (match) {
            return {
                num: parseInt(match[1], 10),
                suffix: match[2]
            };
        }
        // 如果解析失败（比如传了乱码），回退到安全值，避免 NaN
        console.warn(`[YanceyID] Invalid segment parsed: ${seg}`);
        return { num: 0, suffix: "" };
    }

    private static format(num: number): string {
        return num.toString().padStart(5, '0');
    }

    /**
     * 字符串二分算法
     * 寻找两个字符串中间的字符串
     * 
     * Refined Algorithm: "Unlocked Right Boundary"
     */
    private static midSuffix(prev: string, next: string | null): string {
        // 虚拟边界
        const MIN_CHAR = 97;  // 'a'
        const MAX_CHAR = 123; // '{' (z + 1)

        // 找出最大长度，用于遍历
        // 注意：如果 next 为 null，我们视为无限大，逻辑上只需遍历 prev + 1 位
        const len = Math.max(prev.length, next ? next.length : 0) + 1;
        
        // 标记：是否已经摆脱了 next 的约束
        let nextIsUnlocked = (next === null);

        for (let i = 0; i < len; i++) {
            // 获取 Left (Prev 的当前位)
            // 如果 prev 结束了，虚拟填充为 MIN_CHAR ('a')，以便在其后寻找空间
            const charP = (i < prev.length) ? prev.charCodeAt(i) : MIN_CHAR;

            // 获取 Right (Next 的当前位)
            let charN = MAX_CHAR;
            if (!nextIsUnlocked && next && i < next.length) {
                charN = next.charCodeAt(i);
            }

            // 核心逻辑：如果在当前位，prev 和 next 已经有了数值差异
            // 比如 m vs n (109 vs 110)
            // 那么在下一位，next 就无法约束 prev 了
            if (!nextIsUnlocked && charN > charP) {
                nextIsUnlocked = true;
                // 当前位差值 > 1，直接插入
                if (charN - charP > 1) {
                    const mid = Math.floor((charP + charN) / 2);
                    return prev.substring(0, i) + String.fromCharCode(mid);
                }
                // 当前位差值 == 1 (相邻，如 m vs n)
                // 无法在当前位插入，必须进入下一位 (i+1)
                // 此时 nextIsUnlocked = true，下一轮循环 charN 将自动变为 MAX_CHAR
                continue;
            }

            // 如果 charN == charP，继续下一位
            if (charN === charP) {
                continue;
            }
            
            // 如果 nextIsUnlocked (即 charN = 123)
            // 此时我们是在 charP 和 123 之间找
            if (nextIsUnlocked) {
                 const mid = Math.floor((charP + MAX_CHAR) / 2);
                 // 边界检查：如果计算出的 mid == charP (比如 z vs { -> 122.5 -> 122)，说明满了
                 if (mid > charP) {
                     // 成功找到广度中值
                     // 注意：需要保留 prev 之前的字符
                     // 如果 i >= prev.length，说明是在 prev 后面追加
                     if (i >= prev.length) {
                         return prev + String.fromCharCode(mid);
                     } else {
                         // 替换当前位
                         return prev.substring(0, i) + String.fromCharCode(mid);
                     }
                 } else {
                     // 当前位已满 (例如 'z')，必须追加
                     // 继续循环，下一位 charP 会是 'a'，charN 会是 123，一定能找到 'n'
                     continue;
                 }
            }
        }

        // 兜底：如果循环结束还没找到 (理论上不可能，除非 prev == next)
        return prev + 'm';
    }
}
