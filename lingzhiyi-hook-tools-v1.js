/*
v1版本
20210514更新

参考了objection,frida_fart,wallbreaker等源码

代码还是有好多问题~忧桑
*/
var is_print_java_stackTrace = 1
var is_print_args = 1; // print args
var is_print_retval = 1; // print retval
var is_spawn = 0
var is_hooked = false
var is_dumpClass_declared = 1;
var context = null;
var currentApplication = null;
var matched_methods_list = []
var matched_classes = []
var ins_all = []
var last_ins = null
var StringClass = null

function prepare_env() {
    Java.performNow(function() {
        StringClass = Java.use("java.lang.String")
    })
}

function print_stackTrace() {
    Java.perform(function() {
        console.log(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
    });
}

function get_now() {
    var date = new Date()
    var year = date.getFullYear()
    var month = date.getMonth()
    var day = date.getDate()
    var hour = date.getHours()
    var min = date.getMinutes()
    var seconds = date.getSeconds()
    var millsec = date.getMilliseconds()
    var result1 = [year, month, day]
    var result2 = [hour, min, seconds, millsec]
    return "[CurrentTime]" + result1.join("-") + " " + result2.join(":")
}

function print_log(user_log_list, tag) {
    if (tag == undefined) {
        tag = ""
    }
    var num = 20
    var start_symbol = "="
    var end_symbol = "-"
    var now = get_now()
    user_log_list.unshift(now)
    var log_start = new Array(num).join(start_symbol) + "[ThreadId:" + Process.getCurrentThreadId() + "]" + tag + " start!!!" + new Array(num).join(start_symbol)
    user_log_list.unshift(log_start)
    if (is_print_java_stackTrace) {
        user_log_list.push(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()))
    }
    var log_end = new Array(num).join(end_symbol) + "[ThreadId:" + Process.getCurrentThreadId() + "]" + tag + " end!!!" + new Array(num).join(end_symbol)
    user_log_list.push(log_end)
    console.log(user_log_list.join("\n"));
}

function checkByteArrayFromString(bytearray) {
    var bytearray0 = Java.array("byte", bytearray);
    for (var i = 0; i < bytearray0.length; i++) {
        if (isVisible(bytearray[i]) == false) {
            return false;
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
    var str = "";
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

function print_value(param, paramType, i) {
    var result = ""
    var name = null;
    if (i == undefined) {
        name = "(" + paramType + ")retval";
    } else {
        name = "(" + paramType + ")arg[" + i + "]";
    }
    switch (paramType) {
        case "[B":
            var canToString = checkByteArrayFromString(param);
            if (canToString) {
                result = name + " _bytearray= " + StringClass.$new(param)
            } else {
                var param_hex = bytesToHex(param);
                result = name + "_hex = " + param_hex
            }
            break;
        case "java.security.Key":
            var param_bytearray = param.getEncoded();
            var canToString = checkByteArrayFromString(param_bytearray);
            if (canToString) {
                result = name + "_key_str= " + StringClass.$new(param_bytearray)
            } else {
                var param_hex = bytesToHex(param_bytearray);
                result = name + "_key_hex = " + param_hex
            }
            break;
        case "java.security.spec.AlgorithmParameterSpec":
            var IVClass = Java.use("javax.crypto.spec.IvParameterSpec");
            var ivObject = Java.cast(param, IVClass);
            var ivByte = ivObject.getIV();
            var canToString = checkByteArrayFromString(ivByte);
            if (canToString) {
                result = name + "_iv_str= " + StringClass.$new(ivByte)
            } else {
                var param_hex = bytesToHex(ivByte);
                result = name + "_iv_hex = " + param_hex
            }
            break;
        default:
            result = name + "=" + param
            break;
    }
    return result
}

function findActivities() {
    Java.performNow(function() {
        const packageManager = Java.use("android.content.pm.PackageManager");
        const GET_ACTIVITIES = packageManager.GET_ACTIVITIES.value;
        Array.prototype.concat(context.getPackageManager().getPackageInfo(context.getPackageName(), GET_ACTIVITIES).activities.value.map((activityInfo) => {
            console.log("find activity = " + activityInfo.name.value);
        }));
    })
}

function findCurrentActivity() {
    Java.performNow(function() {
        const activityThread = Java.use("android.app.ActivityThread");
        const activity = Java.use("android.app.Activity");
        const activityClientRecord = Java.use("android.app.ActivityThread$ActivityClientRecord");
        const currentActivityThread = activityThread.currentActivityThread();
        const activityRecords = currentActivityThread.mActivities.value.values().toArray();
        let currentActivity;
        for (const i of activityRecords) {
            const activityRecord = Java.cast(i, activityClientRecord);
            if (!activityRecord.paused.value) {
                currentActivity = Java.cast(Java.cast(activityRecord, activityClientRecord).activity.value, activity);
                break;
            }
        }
        if (currentActivity) {
            // Discover an active fragment
            const fm = currentActivity.getFragmentManager();
            const _id = context.getResources().getIdentifier("content_frame", "id", context.getPackageName());
            const fragment = fm.findFragmentById(_id);
            console.log("currentActivity = " + currentActivity.$className);
            console.log("fragment = " + fragment.$className);
        } else {
            console.log("findCurrentActivity error");
        }
    })
}
/*
from imyang
https://github.com/lasting-yang
*/
function hook_RegisterNatives_new() {
    var addrRegisterNatives = ptr(DebugSymbol.fromName("_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi").address);
    if (addrRegisterNatives) {
        Interceptor.attach(addrRegisterNatives, {
            onEnter: function(args) {
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
            onLeave: function(retval) {},
        });
    }
}

function demangle(name) {
    // demangle("_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi")
    // extern "C" char* __cxa_demangle(const char*, char*, size_t*, int*);
    var __cxa_demangle = DebugSymbol.fromName("__cxa_demangle").address;
    var func_demangle = new NativeFunction(__cxa_demangle, "pointer", ["pointer", "pointer", "pointer", "pointer"])
    // var str = Memory.allocUtf8String("_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi");
    var str = Memory.allocUtf8String(name);
    // var output = Memory.alloc(name.length*2)
    // var output_len = Memory.alloc(4)
    // var status = Memory.alloc(2)
    var result = func_demangle(new NativePointer(ptr(str)), ptr(0), ptr(0), ptr(0));
    console.log((result).readCString())
    // console.log(JSON.stringify(Module.enumerateSymbols("libart.so")))
}

function getClassNameListFromClassloader(classloader) {
    var tmpClassNameList = []
    Java.performNow(function() {
        var DexFileClass = Java.use("dalvik.system.DexFile");
        var BaseDexClassLoaderClass = Java.use("dalvik.system.BaseDexClassLoader");
        var DexPathListClass = Java.use("dalvik.system.DexPathList");
        var ElementClass = Java.use("dalvik.system.DexPathList$Element");
        var mBaseDexClassLoader = Java.cast(classloader, BaseDexClassLoaderClass);
        var mPathList = mBaseDexClassLoader.pathList.value;
        var pathListObj = Java.cast(mPathList, DexPathListClass);
        var dexElements = pathListObj.dexElements.value;
        if (dexElements != null) {
            for (var i = 0; i < dexElements.length; i++) {
                var tmpObj = dexElements[i]
                var elementObj = Java.cast(tmpObj, ElementClass)
                var dexFileObj = elementObj.dexFile.value;
                if (dexFileObj != null) {
                    var mCookie = dexFileObj.mCookie.value;
                    var tmpClassNameList = dexFileObj.getClassNameList(mCookie)
                    tmpClassNameList = tmpClassNameList.concat(tmpClassNameList)
                }
            }
        }
    })
    return tmpClassNameList
}
//比起纯粹的枚举加载类，这个方法多了未加载的类
//但是仍有不完善的地方，有些系统类有时候并没有获取到
function getAllClassNameList() {
    var allClassNameList = []
    Java.performNow(function() {
        if (is_spawn) {
            console.log("is_spawning!!!!!")
            Java.use("android.app.Application").attachBaseContext.overload('android.content.Context').implementation = function(context) {
                var result = this.attachBaseContext(context)
                currentApplication = this.currentApplication();
                context = currentApplication.getApplicationContext();
                return result
            }
            currentApplication = Java.use("android.app.ActivityThread").currentApplication();
            context = currentApplication.getApplicationContext();
            var mPathClassLoader = context.getClassLoader()
            var tmpClassNameList = getClassNameListFromClassloader(mPathClassLoader)
            allClassNameList = allClassNameList.concat(tmpClassNameList)
        } else {
            console.log("is_attaching!!!!!")
            var enumerateClassLoaders = Java.enumerateClassLoadersSync()
            for (var i = 0; i < enumerateClassLoaders.length; i++) {
                var loader = enumerateClassLoaders[i]
                if (loader.toString().indexOf("BootClassLoader") != -1) {
                    continue
                }
                var tmpClassNameList = getClassNameListFromClassloader(enumerateClassLoaders[i])
                allClassNameList = allClassNameList.concat(tmpClassNameList)
            }
        }
        var loadedClasses = Java.enumerateLoadedClassesSync() //这里主要是为了加载系统基础类
        allClassNameList = allClassNameList.concat(loadedClasses)
        // allClassNameList = loadedClasses
        allClassNameList = Array.from(new Set(allClassNameList))
    })
    return allClassNameList
}

function traceAllMethod(classnameFilter, methodFilter, overloadFilter) {
    /*
        traceALlMethod("*.Base64")  // trace all class match Base64
        traceAllMethod("","encode","[B,int") // trace all class and method equals encode and overload equals [B,int
        traceAllMethod("*Base64*","*encode","[B,int") // trace  class match Base64 and method match encode and overload equals [B,int
    */
    Java.performNow(function() {
        findMethods(classnameFilter, methodFilter);
        var toBeHookingMethods = []
        // console.log("[traceAllMethod]matched_methods_list.length=", matched_methods_list.length)
        for (var i = 0; i < matched_methods_list.length; i++) {
            var tmpClassName = matched_methods_list[i].getDeclaringClass().getName()
            var tmpMethodName = matched_methods_list[i].getName()
            if (tmpMethodName == tmpClassName) {
                tmpMethodName = "$init"
            }
            var tmpMethodFullName = tmpClassName + "." + tmpMethodName
            toBeHookingMethods.push(tmpMethodFullName)
        }
        toBeHookingMethods = Array.from(new Set(toBeHookingMethods))
        // console.log("[traceAllMethod]toBeHookingMethods.length=", toBeHookingMethods.length)
        for (var i = 0; i < toBeHookingMethods.length; i++) {
            var method = toBeHookingMethods[i]
            traceOneMethod(method, overloadFilter)
        }
    })
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
    Java.performNow(function() {
        var tmpClass = Java.use(classname);
        tmpClass[method].overloads.forEach(function(m) {
            var argumentTypes = m.argumentTypes;
            var returnType = m.returnType.name;
            var parameterStrArray = [];
            for (var tmpArg of argumentTypes) {
                parameterStrArray.push(tmpArg["className"]);
            }
            if (overloadFilter != undefined && overloadFilter != parameterStrArray.join(",")) {
                return true
            } else {
                console.log("hooking " + classname + "." + method + "(" + parameterStrArray.join(",") + ")");
                m.implementation = function() {
                    var user_log_list = []
                    var retval = m.apply(this, arguments);
                    var user_log_list = ["called " + classname + "." + method + "(" + parameterStrArray.join(",") + ")"]
                    for (var i = 0; i < arguments.length; i++) {
                        if (is_print_args) {
                            var tmp_print_value = print_value(arguments[i], parameterStrArray[i], i);
                            user_log_list.push(tmp_print_value)
                        }
                    }
                    if (is_print_retval) {
                        var tmp_print_value = print_value(retval, returnType);
                        user_log_list.push(tmp_print_value)
                    }
                    print_log(user_log_list, classname+"."+method)
                    return retval;
                };
            }
        });
    });
}

function findClasses(classnameFilter) {
    matched_classes = []
    var classReg = new RegExp("^" + classnameFilter + "$")
    var classNameList = getAllClassNameList()
    for (var i = 0; i < classNameList.length; i++) {
        var tmpClassName = classNameList[i]
        if (classReg.exec(tmpClassName) != null) {
            console.log("[findClasses] matched classes => " + tmpClassName)
            matched_classes.push(tmpClassName)
        }
    }
    // return matched_classes
}

function findMethods(classnameFilter, methodFilter) {
    matched_methods_list = [];
    Java.performNow(function() {
        var classNameList = getAllClassNameList()
        for (var i = 0; i < classNameList.length; i++) {
            var classReg = new RegExp("^" + classnameFilter + "$")
            if (classReg.exec(classNameList[i]) != null) {
                // matchedClasses.push(classNameList[i])
                var tmp_methods_list = get_methods_by_className(classNameList[i], methodFilter)
                matched_methods_list = matched_methods_list.concat(tmp_methods_list)
            }
        }
        if (matched_methods_list.length == 0) {
            console.log("[findMethods]no matched method,please check your input!!!")
        } else {
            for (var i = 0; i < matched_methods_list.length; i++) {
                console.log("[findMethods]matched method=", matched_methods_list[i])
            }
            console.log("[findMethods]matched methods_list count=", matched_methods_list.length)
        }
    })
    // return matched_methods_list
}

function get_methods_by_className(classname, methodFilter) {
    var methods_list = []
    if (methodFilter != undefined) {
        var methodFilterReg = new RegExp("^" + methodFilter + "$")
    }
    Java.performNow(function() {
        var tmpClass = Java.use(classname)
        var method_init_all = tmpClass.class.getConstructors();
        for (var i = 0; i < method_init_all.length; i++) {
            var method_init = method_init_all[i]
            if (methodFilterReg == undefined) {
                methods_list.push(method_init)
            } else if (methodFilterReg && methodFilterReg.exec(method_init.getName()) != null) {
                methods_list.push(method_init)
            }
        }
        var method_all = tmpClass.class.getDeclaredMethods();
        for (var i = 0; i < method_all.length; i++) {
            var method = method_all[i]
            if (methodFilterReg == undefined) {
                methods_list.push(method)
            } else if (methodFilterReg && methodFilterReg.exec(method.getName()) != null) {
                methods_list.push(method)
            }
        }
    })
    return methods_list
}
/*
from hanbing
https://github.com/hanbinglengyue
*/
function hookThread() {
    Java.perform(function() {
        var ThreadClass = Java.use("java.lang.Thread");
        ThreadClass.init2.implementation = function(arg0) {
            var target = this.target.value;
            if (target != null) {
                //通过直接实现Runnagle接口run来创建新线程
                var user_log_list = ["go into new Thread.init2->Runnable class:" + target.$className]
                print_log(user_log_list, "java.lang.Thread")
            } else {
                //通过继承Thread类并覆写run函数来创建新线程
                var user_log_list = ["go into extends Thread.init2->Runnable class:" + this.$className]
                print_log(user_log_list, "java.lang.Thread")
                var threadClassname = this.$className;
                var ChindThreadClass = Java.use(threadClassname);
                ChindThreadClass.run.implementation = function() {
                    var user_log_list = ["go into " + threadClassname + ".run"]
                    print_log(user_log_list, "java.lang.Thread")
                    var result = this.run();
                    return result;
                };
            }
            var result = this.init2(arg0);
            return result;
        };
        ThreadClass.run.implementation = function() {
            var target = this.target.value;
            if (target != null) {
                var user_log_list = ["go into new Thread.run->Runnable class:" + target.$className]
                print_log(user_log_list, "java.lang.Thread")
            }
            var reuslt = this.run();
            return reuslt;
        };
    });
}

function searchAllInstance(classFullName) {
    ins_all = []
    console.log("start searchOneInstance:" + classFullName);
    Java.performNow(function() {
        Java.choose(classFullName, {
            onMatch: function(inst) {
                console.log(new Array(100).join("="))
                console.log("[searchAllInstance]ins=", inst)
                ins_all.push(inst);
            },
            onComplete: function() {},
        });
    });
    console.log("[searchAllInstance] search finished")
    if (ins_all.length == 0) {
        console.log("[searchAllInstance]not found instance of " + classFullName)
    } else {
        console.log("[searchAllInstance]found " + ins_all.length + " instance of " + classFullName)
        for (var i = 0; i < ins_all.length; i++) {
            if (i == ins_all.length - 1) {
                last_ins = ins_all[i]
            }
        }
    }
}

function getParameterTypesToString(parameterTypes) {
    var result = []
    for (var i = 0; i < parameterTypes.length; i++) {
        var tmpType = parameterTypes[i]
        var typeName = tmpType.getName()
        result.push(typeName)
    }
    return result.join(", ")
}

function dumpClass(classFullName) {
    Java.performNow(function() {
        var tmpClass = Java.use(classFullName)
        var packageName = tmpClass.class.getPackage().getName()
        if (is_dumpClass_declared) {
            var field_all = tmpClass.class.getDeclaredFields();
        } else {
            var field_all = tmpClass.class.getFields();
        }
        var Modifier = Java.use("java.lang.reflect.Modifier");
        var user_log_list = []
        var classObj = {
            "static_fileds": [],
            "ins_fields": [],
            "contructor_methods": [],
            "static_methods": [],
            "methods": []
        }
        for (var i = 0; i < field_all.length; i++) {
            var field = field_all[i]
            var fieldType = field.getType().getName();
            var fieldName = field.getName();
            var isStatic = Modifier.isStatic(field.getModifiers())
            if (isStatic) {
                var fieldValue = tmpClass[fieldName].value;
                classObj["static_fileds"].push({
                    "key": fieldType + " " + fieldName,
                    "value": fieldValue
                })
            } else {
                classObj["ins_fields"].push({
                    "key": fieldType + " " + fieldName,
                    "value": null
                })
            }
        }
        var method_init_all = tmpClass.class.getConstructors();
        for (var i = 0; i < method_init_all.length; i++) {
            var method_init = method_init_all[i]
            var method_init_str = method_init.toString().split("throws")[0].trim()
            var method_init_ParameterTypes = method_init.getParameterTypes()
            var method_init_ParameterTypesStr = getParameterTypesToString(method_init_ParameterTypes)
            var method_init_str = "$init(" + method_init_ParameterTypesStr + ")"
            classObj["contructor_methods"].push(method_init_str)
        }
        if (is_dumpClass_declared) {
            var method_all = tmpClass.class.getDeclaredMethods();
        } else {
            var method_all = tmpClass.class.getMethods();
        }
        for (var i = 0; i < method_all.length; i++) {
            var method = method_all[i]
            var methodStr = method.toString().split("throws")[0].trim()
            var methodReturnType = method.getReturnType().getName()
            var methodName = method.getName()
            var methodParameterTypes = method.getParameterTypes()
            var method_ParameterTypesStr = getParameterTypesToString(methodParameterTypes)
            var method_str = methodReturnType + " " + methodName + " (" + method_ParameterTypesStr + ")"
            var isStatic = Modifier.isStatic(method.getModifiers())
            if (isStatic) {
                classObj["static_methods"].push(method_str)
            } else {
                classObj["methods"].push(method_str)
            }
        }
        //开始打印classObj
        var user_log_list = []
        var tab = new Array(8).join(" ")
        user_log_list.push("package " + packageName + ";")
        console.log(classFullName.slice(classFullName.indexOf(packageName)))
        user_log_list.push("class " + classFullName.slice(packageName.length + 1) + " {")
        user_log_list.push("")
        user_log_list.push(tab + "/* static fields */")
        var static_fileds = classObj["static_fileds"]
        for (var i = 0; i < static_fileds.length; i++) {
            var tmpField = static_fileds[i]
            var tmpFieldName = tmpField["key"]
            var tmpFieldValue = tmpField["value"]
            user_log_list.push(tab + tmpFieldName + " => " + tmpFieldValue)
        }
        user_log_list.push("")
        user_log_list.push(tab + "/* instance fields */")
        var ins_fields = classObj["ins_fields"]
        for (var i = 0; i < ins_fields.length; i++) {
            var tmpField = ins_fields[i]
            var tmpFieldName = tmpField["key"]
            var tmpFieldValue = tmpField["value"]
            user_log_list.push(tab + tmpFieldName + " => " + tmpFieldValue)
        }
        user_log_list.push("")
        user_log_list.push(tab + "/* constructor methods */")
        var contructor_methods = classObj["contructor_methods"]
        for (var i = 0; i < contructor_methods.length; i++) {
            var contructor_method = contructor_methods[i]
            user_log_list.push(tab + contructor_method)
        }
        user_log_list.push("")
        user_log_list.push(tab + "/* static methods */")
        var static_methods = classObj["static_methods"]
        for (var i = 0; i < static_methods.length; i++) {
            var static_method = static_methods[i]
            user_log_list.push(tab + static_method)
        }
        user_log_list.push("")
        user_log_list.push(tab + "/* methods */")
        var methods = classObj["methods"]
        for (var i = 0; i < methods.length; i++) {
            var method = methods[i]
            user_log_list.push(tab + method)
        }
        user_log_list.push("}")
        print_log(user_log_list, classFullName)
        return 0
    })
}

function hook_java() {
    //根据需求手动设置变量is_spawn的值，然后再下方的TODO处写用户代码
    if (is_spawn) {
        Java.use("android.app.Application").onCreate.implementation = function() {
            var result = this.onCreate()
            console.log("enter android.app.Application.onCreate!!!")
            if (!is_hooked) {
                // TODO 在此处添加用户代码
                // traceOneMethod("android.util.Base64.encodeToString")
                is_hooked = true
            }
            return result
        }
    } else {
        // TODO 在此处添加用户代码
        // traceOneMethod("android.util.Base64.encodeToString")
        is_hooked = true
    }
}

function main() {
    prepare_env()
    hook_java()
    // test()
}
setImmediate(main)