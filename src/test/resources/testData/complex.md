# 复杂 Markdown 测试文件

这个文件展示了更多复杂的 Markdown 格式元素。

## 表格

| 名称 | 年龄 | 职业 | 城市 |
|------|-----|------|------|
| 张三 | 28  | 软件工程师 | 北京 |
| 李四 | 35  | 产品经理 | 上海 |
| 王五 | 42  | 数据科学家 | 广州 |
| 赵六 | 31  | UI设计师 | 深圳 |

### 对齐的表格

| 左对齐 | 居中对齐 | 右对齐 |
|:-------|:-------:|-------:|
| 单元格 | 单元格 | 单元格 |
| 长文本 | 居中文本 | 右对齐文本 |

## 代码块

内联代码: `var x = 10;`

```python
# Python 代码示例
def factorial(n):
    if n == 0 or n == 1:
        return 1
    else:
        return n * factorial(n-1)
        
result = factorial(5)
print(f"5的阶乘是: {result}")
```

```java
// Java 代码示例
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        
        for (int i = 0; i < 5; i++) {
            System.out.println("Count: " + i);
        }
    }
}
```

```sql
-- SQL 查询示例
SELECT 
    users.name, 
    orders.order_date,
    SUM(order_items.price) as total_price
FROM 
    users
JOIN 
    orders ON users.id = orders.user_id
JOIN 
    order_items ON orders.id = order_items.order_id
WHERE 
    orders.order_date > '2023-01-01'
GROUP BY 
    users.name, orders.order_date
HAVING 
    total_price > 100
ORDER BY 
    total_price DESC;
```

## 任务列表

- [x] 完成的任务
- [ ] 未完成的任务
- [x] 另一个完成的任务
- [ ] 带有 **格式化** 文本的任务

## 脚注

这是一个带有脚注的文本[^1]。

[^1]: 这是脚注的内容。

## 数学公式

内联公式: $E = mc^2$

公式块:

$$
\frac{d}{dx}\left( \int_{a}^{x} f(t)dt \right) = f(x)
$$

$$
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
$$

## 嵌套列表

1. 第一层
   - 第二层
     - 第三层
       - 第四层
   - 回到第二层
2. 回到第一层

## 定义列表

术语 1
: 定义 1

术语 2
: 定义 2a
: 定义 2b

## HTML 嵌入

<div style="padding: 10px; border: 1px solid gray; background-color: #f0f0f0;">
  这是通过 HTML 创建的自定义容器
  <ul>
    <li>可以包含任何 HTML 元素</li>
    <li>比如这个列表</li>
  </ul>
</div>

<table>
  <tr>
    <th>列1</th>
    <th>列2</th>
  </tr>
  <tr>
    <td>A</td>
    <td>B</td>
  </tr>
</table>

## 总结

这个文件展示了高级的 Markdown 语法和格式元素，可以测试 Markdown 到 PDF 转换功能的完整性。