import usb from '../articles/usb-serial-communications.html?raw';
import typescript from '../articles/advanced-typescript.html?raw';
import { RawArticle } from './RawArticle';
export const articles=[
 {path:'/articles/usb-serial',title:'USB & Serial Comms',subtitle:'Protocols under the cable',element:<RawArticle source={usb}/>},
 {path:'/articles/advanced-typescript',title:'Advanced TypeScript',subtitle:'The type system under the hood',element:<RawArticle source={typescript}/>}
] as const;