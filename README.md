# lingzhiyi-hook-tools

## traceOneMethod函数
要求传入的方法名为完整的方法名
```js
traceOneMethod("javax.crypto.Cipher.doFinal") // 对javax.crypto.Cipher.doFinal进行hook，包括重载方法的hook;
traceOneMethod("javax.crypto.Cipher.doFinal","[B") // 传入方法签名的时候，仅对参数为[B的方法进行hook;
```
----

## traceAllMethod函数
```js
traceAllMethod("*http*") //对类名中包含了http的类进行hook，批量hook成千上万个函数;
traceAllMethod("*http*","$init")// 对类名中包含了http的类进行hook，仅批量hook他们的构造函数;
traceAllMethod("*http*","$init","[B") //对类名中包含了http的类进行hook，批量hook他们的构造函数，过滤出参数为[B的函数;
```
----

## hook_RegisterNatives_new函数

对动态注册的函数进行hook，获取其注册到的类名，签名以及so的文件名和偏移。

----

## future等待实现

frida提供了很多可能，现在只是列出一些想到的，可以做成工具避免重复劳动
将在之后慢慢实现的功能。

### findInterfaceImpl函数（待实现）

### print_value(部分实现)
在case里面增加想要打印的参数格式，针对常见不同的参数类型进行不同的打印方式，完成适配

### HttpURLConnection/ok3/retrofit2的hook(待实现)

### c层非标准算法的主动调用（待实现）
基于frida的new CModule相关api可以进行非标准算法的快速调用与实现

### stalker对natvie层的追踪（待实现）

### Instruction.parse反汇编api的使用（待实现）

### socket的使用（待实现）
