# voip24h-sip-gateway
[![NPM version](https://img.shields.io/npm/v/voip24h-sip-gateway.svg?style=flat)]([https://www.npmjs.com/package/voip24h-sip-gateway])

## Mục lục

- [Tính năng và các Event](#tính-năng-và-các-event)
- [Cài đặt](#cài-đặt)
- [Sử dụng](#sử-dụng)

## Tính năng và các Event
| Chức năng | Mô tả |
| --------- | ----- |
| CallKit   | • Kết nối tài khoản SIP <br> • Gọi đi/Nhận cuộc gọi đến <br> • Chấp nhận cuộc gọi/Từ chối cuộc gọi đến/Ngắt máy <br> • Pause/Resume cuộc gọi <br> • Hold/Unhold cuộc gọi <br> • Bật/Tắt mic <br> • Lấy trạng thái mic <br> • Transfer cuộc gọi <br> • Send DTMF |

• Event khởi tạo và đăng ký tài khoản SIP <br>
| Event | Mô tả và Response |
| --------- | ----- |
| Registered | • Đăng ký tài khoản SIP thành công.|
| RegistrationFailed | • Đăng ký tài khoản SIP thất bại. |

• Event cuộc gọi đến <br>
| Event | Mô tả và Response |
| --------- | ----- |
| Incomingcall | • Sự kiện đang có cuộc gọi đến. <br> • Response: {phonenumer: số_điện_thoại}|
| Accepted | • Sự kiện chấp nhận cuộc gọi đến. |
| Hangup <br> EmployerHangup <br> CustomerHangup | • Sự kiện kết thúc cuộc gọi. <br> CustomerHangup : Khách hàng cúp máy <br> EmployerHangup: Nhân viên cúp máy |
| Reject | • Sự kiện từ chối cuộc gọi đến. |

• Event cuộc gọi đi <br>
| Event | Mô tả và Response |
| --------- | ----- |
| Calling | • Bắt sự kiện cuộc gọi đi. <br> |
| Accepted | • Chấp nhận cuộc gọi đi từ phía người nhận. |
| Hangup <br> EmployerHangup <br> CustomerHangup | • Sự kiện kết thúc cuộc gọi. <br> CustomerHangup : Khách hàng cúp máy <br> EmployerHangup: Nhân viên cúp máy |

• Event kiểm tra các xử lý trong cuộc gọi <br>
| Event | Mô tả và Response |
| --------- | ----- |
| transfer | • Chuyển tiếp cuộc gọi. <br> |
| holding <br> unholding | • Kiểm tra trạng thái giữ cuộc gọi. Hoặc sử dụng hàm <b>isHold( )</b>. |
| Hangup <br> EmployerHangup <br> CustomerHangup | • Sự kiện kết thúc cuộc gọi. <br> CustomerHangup : Khách hàng cúp máy <br> EmployerHangup: Nhân viên cúp máy |
|          |Kiểm tra Bật/Tắt mic sử dụng hàm <b>isMute( )</b>.|

• Event kiểm tra tiến trình WebRTC
| Event | Mô tả và Response |
| --------- | ----- |
| Error | • Kiểm tra lỗi trong tiến trình. <br> • Response: {error: thông_tin_lỗi}|
| Destroyed | • Kiểm tra sự kiện hủy tiến trình. |
| ServerDown | • Kiểm tra sự kiện server ngưng hoạt động. <br> • Response: {event: thông_tin_sự_kiện}|
| Closing | • Kiểm tra sự kiện mất tính hiệu do tắt trang.|

## Cài đặt
Sử dụng npm:
```bash
$ npm install voip24h-sip-gateway
```
Sử dụng yarn:
```bash
$ yarn add voip24h-sip-gateway
```

## Sử dụng
• Import thư viện voip24h-sip-gateway vào

  ```
  import { Voip24hModule, EventSipGateway } from 'voip24h-sip-gateway';
  ```
• Khởi chạy thư viện bằng cách gọi `Voip24hModule.getInstance()` trong function 'cha' của hệ thống và truyền chuỗi `'all'` để bật debug

  ```
  //Khởi tạo không có debug
  var module = Voip24hModule.getInstance()
  //Khởi tạo có debug
  var module = Voip24hModule.getInstance('all')
  ```
• Khởi tạo hàm để bắt các sự kiện của thư viện trả về. Bằng cách gọi hàm `pushEventToSide` trong hook `useEffect` <br>
  ***Lưu ý: Các sự kiện có trả Response và cách lấy Response:
  | Event | Mô tả và Response |
  | --------- | ----- |
  | Incomingcall | • Sự kiện đang có cuộc gọi đến. <br> • Response: {phonenumer: số_điện_thoại}|
  | Error | • Kiểm tra lỗi trong tiến trình. <br> • Response: {error: thông_tin_lỗi}|
  | ServerDown | • Kiểm tra sự kiện server ngưng hoạt động. <br> • Response: {event: thông_tin_sự_kiện}|
  ```
  useEffect(() => {
    module.pushEventToSide(
      {
        onmessageOutSide: function (event,data) {
          console.log("Trạng thái: " + event);
          if(event === EventSipGateway.Incomingcall){
            console.log("Số gọi đến: " + data.phonenumber)
          }else if(event === EventSipGateway.Error){
            console.log("Thông tin lỗi: " + data.error)
          }
        }
      }
    );
  }, []);
  ```
• Đăng ký tài khoản SIP sử dụng hàm `registerSip(ipAddressSIP, numberSIP, password);`
  ```
  module.registerSip("14.225.254.251", "100", "password");
  ```
  -Kiểm tra xem trạng thái đã đăng ký tài khoản SIP bằng cách check Event register hoặc sử dụng hàm `isRegistered();`.
  ```
  module.isRegistered();
  ```
  | Response | Mô tả |
  | --------- | ----- |
  | true | • Đã đăng ký SIP|
  | false | • Chưa đăng ký SIP|

• Thực hiện cuộc gọi sử dụng hàm `call(phonenumber);`
  ```
  module.call("0981998945");
  ```

• Ngắt/Hủy cuộc gọi sử dụng hàm `hangUp();`
  ```
  module.hangUp();
  ```
• Các hàm xử lý cuộc gọi đến
  ```
  //Nhận cuộc gọi
  module.answer();
  //Từ chối cuộc gọi
  module.reject();
  ```
• Các hàm xử lý trong cuộc gọi <br>
  -Trong cuộc gọi, hàm Tắt/Bật mic :
  ```
  module.toggleMute();
  ```
  -Kiểm tra xem trạng thái của mic đang bật hay tắt:
  ```
  module.isMute();
  ```
  | Response | Mô tả |
  | --------- | ----- |
  | true | • Mic đang tắt|
  | false | • Mic đang bật|

  -Trong cuộc gọi, hàm Hold/Unhold :
  ```
  module.toggleHold();
  ```
  -Kiểm tra xem trạng thái Hold/Unhold:
  ```
  module.isHold();
  ```
  | Response | Mô tả |
  | --------- | ----- |
  | true | • Đang hold cuộc gọi|
  | false | • Cuộc gọi bình thường|

• Trong cuộc gọi, muốn chuyển tiếp cuộc gọi cho số điện thoại khác sử dụng hàm `transfer(phonenumber_to_transfer)`:
  ```
  module.transfer(102)
  ```
• Trong cuộc gọi, sử dụng dtmf, hàm `sendDtmf(number)` :
  ```
  module.sendDtmf(2);
  ```
• Hàm hủy tiến trình WebRTC sử dụng hàm `release()`:
  ```
  module.release();
  ```















































