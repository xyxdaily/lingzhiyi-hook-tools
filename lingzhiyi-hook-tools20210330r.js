
/*
author:菱志漪
wechat:lovexyx2020
qq:1460334467

学习ast与js逆向请找蔡老板(wechat:deepcry)，学习安卓逆向请找肉丝姐(wechat:r0ysue)，感谢他们带我入门，感谢一起学习的小伙伴。

*/
var StringClass = null;
var ByteString = null;
var currentApplication = null;
var context = null;
var printArgs = 1; // print args
var printRetval = 1; // print retval
var printTraceStack = 0; // print tracestack

function prepare_env() {
    Java.perform(function () {
        StringClass = Java.use("java.lang.String");
        ByteString = Java.use("com.android.okhttp.okio.ByteString"); // ByteString.of(bArr).hex()
        currentApplication = Java.use("android.app.ActivityThread").currentApplication();
        context = currentApplication.getApplicationContext();
    });
}

function print_stackTrace() {
    Java.perform(function () {
        console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
    });
}

function print_equals(num, symbol) {
    console.log(new Array(num).join(symbol));
}
// query函数的作用是快速查找匹配的类以及方法，用来后续的批量trace以及快速定位
function query(classname, method) {
    // '*Base64*!*encode*'
    // '**!*encode*' match all methods who contains encrypt
    // '*Base64*!**' match all classes
    var filterPattern = "*Base64*!*encode*";
    var groups = null;
    if (classname == undefined && method == undefined) {
        console.log("please enter classname or method");
        return groups;
    }
    if (!classname) {
        classname = "*";
    }
    if (!method) {
        method = "*";
    }
    var filterPattern = classname + "!" + method;
    Java.performNow(function () {
        groups = Java.enumerateMethods(filterPattern);
    });
    return groups;
}

function findClasses(classnameFilter) {
    var classList = [];
    var groups = query(classnameFilter);
    if (groups != "" && groups != null) {
        for (var group of groups) {
            var classes = group["classes"];
            for (var cls of classes) {
                var classname = cls["name"];
                console.log("find classname=", classname);
                classList.push(classname);
            }
        }
        console.log("search finished and found " + classList.length + " class");
    } else {
        console.log("search finished and found 0 class");
    }
    return classList;
}

function findMethods(classnameFilter, methodFilter) {
    var methodList = [];
    var groups = query(classnameFilter, methodFilter);
    if (groups != "" && groups != null) {
        for (var group of groups) {
            var classes = group["classes"];
            for (var cls of classes) {
                var classname = cls["name"];
                var methods = cls["methods"];
                console.log("find method=", classname + "." + method);
                for (var method of methods) {
                    methodList.push(classname + "." + method);
                }
            }
        }
        console.log("search finished and found " + methodList.length + " method");
    } else {
        console.log("search finished and found 0 method");
    }
    return methodList;
}

function traceAllMethod(classnameFilter, methodFilter, overloadFilter) {
    /*
        traceALlMethod("*.Base64")  // trace all class match Base64
        traceAllMethod("","encode","[B,int") // trace all class and method equals encode and overload equals [B,int
        traceAllMethod("*Base64*","*encode","[B,int") // trace  class match Base64 and method match encode and overload equals [B,int
    */
    var methods = findMethods(classnameFilter, methodFilter);
    for (var method of methods) {
        traceOneMethod(method, overloadFilter);
    }
}

function traceOneMethod(fullMethodName, overloadFilter) {
    /*
        traceOneMethod("java.net.URL.$init") // trace all method of $init
        traceOneMethod("java.net.URL.$init","java.lang.String") 
        traceOneMethod("java.net.URL.$init","java.net.URL,java.lang.String")
    */
    var split_length = fullMethodName.split(".").length;
    var method = fullMethodName.split(".")[split_length - 1];
    var classname = fullMethodName.slice(0, fullMethodName.length - method.length - 1); // -1是为了去掉那个点
    // console.log("classname=" + classname + " method=" + method);
    Java.performNow(function () {
        try {
            var canUse = checkClassCanUse(classname);
            if (!canUse) {
                console.log("java.lang.ClassNotFoundException,maybe not loaded:classname=" + classname);
                return;
            }
            var tmpClass = Java.use(classname);
            tmpClass[method].overloads.forEach(function (m) {
                // console.log("m=", m);
                var argumentTypes = m.argumentTypes;
                var returnType = m.returnType.name;
                var parameterStrArray = [];
                for (var tmpArg of argumentTypes) {
                    parameterStrArray.push(tmpArg["className"]);
                }
                if (!overloadFilter) {
                    console.log("hooking " + classname + "." + method + "(" + parameterStrArray.join(",") + ")");
                    m.implementation = function () {
                        var retval = m.apply(this, arguments);
                        print_equals(100, "=");
                        console.log("[ThreadId:" + Process.getCurrentThreadId() + "]" + "called " + classname + "." + method + "(" + parameterStrArray.join(",") + ")");

                        for (var i = 0; i < arguments.length; i++) {
                            if (printArgs) {
                                // console.log(parameterStrArray[i] + ":arg[" + i + "]=" + arguments[i]);
                                print_value(arguments[i],parameterStrArray[i],i);
                            }
                        }
                        // console.log(classname+"."+method+"("+parameterStrArray.join(",")+")"+"->retval=",retval)
                        if (printRetval) {
                            // console.log(returnType + ":retval=", retval);
                            print_value(retval,returnType)
                        }
                        if (printTraceStack) {
                            print_stackTrace();
                        }
                        return retval;
                    };
                } else if (overloadFilter == parameterStrArray.join(",")) {
                    console.log("hooking " + classname + "." + method + "(" + parameterStrArray.join(",") + ")");
                    m.implementation = function () {
                        var retval = m.apply(this, arguments);
                        print_equals(100, "=");
                        console.log("[ThreadId:" + Process.getCurrentThreadId() + "]" + "called " + classname + "." + method + "(" + parameterStrArray.join(",") + ")");

                        for (var i = 0; i < arguments.length; i++) {
                            if (printArgs) {
                                print_value(arguments[i],parameterStrArray[i],i);
                                // console.log(parameterStrArray[i] + ":arg[" + i + "]=" + arguments[i]);
                            }
                        }
                        // console.log(classname+"."+method+"("+parameterStrArray.join(",")+")"+"->retval=",retval)
                        if (printRetval) {
                            // console.log(returnType + ":retval=", retval);
                            print_value(retval,returnType)
                        }
                        if (printTraceStack) {
                            print_stackTrace();
                        }
                        return retval;
                    };
                } else {
                    return;
                }
            });
        } catch (e) {
            console.log(e);
            console.log("error classname=" + classname + " method=" + method);
        }
    });
}

/*
from imyang
https://github.com/lasting-yang
*/
function hook_RegisterNatives_new() {
    var addrRegisterNatives = ptr(DebugSymbol.fromName("_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi").address);
    if (addrRegisterNatives) {
        Interceptor.attach(addrRegisterNatives, {
            onEnter: function (args) {
                print_equals(100, "=");
                console.log("[RegisterNatives] method_count:", args[3]);
                var env = args[0];
                var java_class = args[1];
                // var class_name = env.getClassName(java_class)
                var class_name = Java.vm.getEnv().getClassName(java_class);
                var methods_ptr = ptr(args[2]);
                var method_count = parseInt(args[3]);
                for (var i = 0; i < method_count; i++) {
                    var name_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3));
                    var sig_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3 + Process.pointerSize));
                    var fnPtr_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3 + Process.pointerSize * 2));
                    var name = Memory.readCString(name_ptr);
                    var sig = Memory.readCString(sig_ptr);
                    var find_module = Process.findModuleByAddress(fnPtr_ptr);
                    console.log("[RegisterNatives] java_class:", class_name, "name:", name, "sig:", sig, "fnPtr:", fnPtr_ptr, "module_name:", find_module.name, "module_base:", find_module.base, "offset:", ptr(fnPtr_ptr).sub(find_module.base));
                }
            },
            onLeave: function (retval) {},
        });
    }
}

function checkClassCanUse(classname) {
    var canUse = false;
    try {
        var currentClass = Java.use(classname);
        currentClass.$dispose();
        canUse = true;
    } catch (e) {
        // console.log(classname, "============", e)
        Java.enumerateClassLoaders({
            onMatch: function (loader) {
                try {
                    if (loader.findClass(classname)) {
                        Java.classFactory.loader = loader;
                        // console.log("change classloader Successful found ");
                        canUse = true;
                    }
                } catch (error) {
                    // console.log("find error:" + error);
                }
            },
            onComplete: function () {},
        });
        return canUse;
    }
    return canUse;
}

function findAbstractImpl(classnameFilter) {
    // findAbstractImpl("android.hardware.SensorManager")      android.hardware.SystemSensorManager
    // findAbstractImpl("java.net.HttpURLConnection")  com.android.okhttp.internal.huc.HttpURLConnectionImpl
    Java.performNow(function () {
        var Modifier = Java.use("java.lang.reflect.Modifier");
        var classes = findClasses(classnameFilter);
        for (var classname of classes) {
            print_equals(100, "=");
            var canUse_ = checkClassCanUse(classname);
            if (!canUse_) continue;
            var isAbstract = Modifier.isAbstract(Java.use(classname).class.getModifiers());
            console.log("classname=", classname, " isAbstract?=" + isAbstract);
            if (isAbstract == false) {
                console.log("the class:[" + classname + "] is not AbstractClass!");
                continue;
            }
            var allClasses = findClasses("");
            try {
                for (var tmpClassname of allClasses) {
                    // console.log("classname=", tmpClassname);
                    var canUse = checkClassCanUse(tmpClassname);
                    if (canUse != true) continue;
                    var tmpClassnameClass = null;
                    tmpClassnameClass = Java.use(tmpClassname);
                    // if (tmpClassnameClass == null) continue;
                    var isAbstract2 = Modifier.isAbstract(tmpClassnameClass.class.getModifiers());
                    if (isAbstract2 == true) continue;
                    var tmpClassnameSuper = tmpClassnameClass.class.getSuperclass();
                    if (tmpClassnameSuper == null) continue;
                    if (tmpClassnameSuper.getName() == classname) {
                        console.log("found AbstractClass[" + classname + "] Impl is [" + tmpClassnameClass.class.getName() + "]");
                    }
                }
            } catch (e) {
                console.log(e, " here is a bug I do not konw 55555----------", tmpClassname);
            }
        }
        console.log("findAbstractImpl finished~");
    });
}

function help() {
    print_equals(100, "=");
    console.log('find("","") => will find all classes and all methods');
    console.log('find("*Base64*","") => will find all classes who matches Base64 and all methods');
    console.log('find("","decode") => will find all classes  and all methods who equals decode');
    print_equals(100, "=");
    console.log('traceOneMethod("javax.crypto.Cipher.doFinal") => trace the method with all overloads');
    console.log('traceOneMethod("javax.crypto.Cipher.doFinal","[B") => trace the method with the overloads matches [B');
    print_equals(100, "=");
    console.log('traceAllMethod("*http*") => trace all classes who match http and all the methods');
    console.log('traceAllMethod("*http*","$init") => trace all classes who match http and all the methods equals $init');
    console.log('traceAllMethod("*http*","$init","[B") => trace all classes who match http and all the methods equals get');
    print_equals(100, "=");
    console.log('findAbstractImpl("java.net.HttpURLConnection") => find the impl of class');
    print_equals(100, "=");
    console.log('searchOneInstance("okhttp3.Request") => search the instance of classes');
    console.log("console.log(currentIns.headers()) => call the method headers of currentIns");
}

// use this function first
function find(classname, method) {
    /*
        find("*.Cipher") // find all classes endswith .Cipher
        find("","doFinal") // find all methods equal doFinal
        find("*Base64*","*encode*") // find all classes match Base64 and methods match encode
    */
    var filterPattern = "*Base64*!*encode*";
    if (classname == undefined && method == undefined) {
        console.log('maybe you can input find("","") find all classes and all methods');
        return;
    }
    if (!classname) {
        classname = "*";
    }
    if (!method) {
        method = "*";
    }

    var filterPattern = classname + "!" + method;
    Java.performNow(function () {
        const groups = Java.enumerateMethods(filterPattern);
        if (groups != "") {
            for (var group of groups) {
                var classes = group["classes"];
                for (var cls of classes) {
                    var classname = cls["name"];
                    var methods = cls["methods"];
                    print_equals(100, "=");
                    console.log("found class => " + classname);
                    for (var method of methods) {
                        console.log("found method => " + classname + "." + method);
                    }
                    console.log("found " + methods.length + " methods");
                }
            }
            console.log("search finished");
        } else {
            console.log("search finished and found 0 method");
        }
    });
}

var currentIns = null;
function searchOneInstance(classFullName) {
    // searchOneInstance("okhttp3.Request")
    if(currentIns!=null){
        currentIns = null;
    }
    console.log("start searchOneInstance:" + classFullName);
    Java.performNow(function () {
        Java.choose(classFullName, {
            onMatch: function (ins) {
                currentIns = ins;
                print_equals(100, "=");
                console.log("ins=", ins);
                var tmpClass = ins.getClass();
                var field_all = tmpClass.getDeclaredFields();
                for (var field of field_all) {
                    var retType = field.getType().getName();
                    var fieldName = field.getName();
                    var fieldValue = ins[fieldName].value;
                    console.log(classFullName+"["+fieldName+"]="+fieldValue)
                    // console.log("field_name=", fieldName, ";retType:", retType, ",field_value=", fieldValue);
                    if (fieldValue != undefined) {
                    }
                }
                var method_init_all = tmpClass.getConstructors();
                for (var method_init of method_init_all) {
                    console.log("method.$init = ", method_init);
                }
                var method_all = tmpClass.getDeclaredMethods();
                // console.log('method_all=', method_all);
                for (var method of method_all) {
                    console.log("method = ", method);
                }
            },
            onComplete: function () {},
        });
    });
    if (currentIns == null) {
        print_equals(100,"-")
        console.log("not found instance of " + classFullName);
        console.log("it maybe a class who has many static field and method") // 这里会出现有些方法是非静态的
        var canUse = checkClassCanUse(classFullName) 
        if(!canUse){
            console.log("java.use failed~")
        }else{
            var tmpClass = Java.use(classFullName);
            currentIns = tmpClass;
            var field_all = tmpClass.class.getDeclaredFields();
            for (var field of field_all) {
                    var retType = field.getType().getName();
                    var fieldName = field.getName();
                    var fieldValue = tmpClass[fieldName].value;
                    console.log(classFullName+"["+fieldName+"]="+fieldValue)
                    if (fieldValue != undefined) {
                    }
                }
                var method_init_all = tmpClass.class.getConstructors();
                for (var method_init of method_init_all) {
                    console.log("method.$init = ", method_init);
                }
                var method_all = tmpClass.class.getDeclaredMethods();
                for (var method of method_all) {
                    console.log("method = ", method);
                }
        }
        print_equals(100,"-")
    }
    console.log("end searchOneInstance:[" + classFullName+"]");
}

function checkByteArrayFromString(bytearray){
    var bytearray0 = Java.array('byte', bytearray);
    for (var i = 0; i < bytearray0.length; i++) {
        if (isVisible(bytearray[i])==false) {
            return false
        }
    }
    return true;
}

function isVisible(value) {
    if (value >= 32 && value <= 126) {
        return true;
    }
    return false;
}

function bytesToHex(arr) {
    var str = '';
    var k, j;
    for (var i = 0; i < arr.length; i++) {
        k = arr[i];
        j = k;
        if (k < 0) {
            j = k + 256;
        }
        if (j < 16) {
            str += "0";
        }
        str += j.toString(16);
    }
    return str;
}

//TODO
function print_value(param, paramType,i) {
    var name = null;
    if(i==undefined){
        name = "("+paramType+")retval"
    }else{
        name = "("+paramType+")arg["+i+"]"
    }

    switch(paramType){
        case "[B":
            var canToString = checkByteArrayFromString(param)
            if(canToString){
                console.log(name+" = "+StringClass.$new(param))
            }else{
                var param_hex = bytesToHex(param)
                console.log(name+"_hex = "+param_hex)
            }
            break
        default:
            console.log(name+"="+param)
            break
    }
}

function call_java(){
    Java.performNow(function(){
       
    })
}

function hook_java() {
    Java.perform(function () {
        // for test
        Java.use("android.util.Base64").encodeToString.overload("[B", "int").implementation = function (bArr, flag) {
            var result = this.encodeToString(bArr, flag);
            // console.log("android.util.Base64.encodeToString->",result)
            // console.log("returnType=", this.encodeToString.overloads[0].returnType.name);
            // console.log("argumentTypes", JSON.stringify(this.encodeToString.overloads[0].argumentTypes));
            // console.log("returnType",Java.use("android.util.Base64").encodeToString.overloads[0].returnType.name);
            // console.log("argumentTypes",JSON.stringify(Java.use("android.util.Base64").encodeToString.overloads[0].argumentTypes));
            return result;
        };
    });
}

function hook_native() {}

function main() {
    // frida -UF -l lingzhiyi-hook-tools20210330r.js -o out.log
    // frida -UF -l lingzhiyi-hook-tools20210330r.js > out.log
    prepare_env();
    hook_java();
    hook_native();
}
setImmediate(main);
