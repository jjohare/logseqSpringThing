   <script>
   import { defineComponent, inject, onMounted, onBeforeUnmount } from 'vue';

   export default defineComponent({
       name: 'ChatManager',
       props: {
           // Removed websocketService prop as it's now injected
       },
       data() {
           return {
               chatInput: '',
               chatMessages: [],
               useOpenAI: false,
           };
       },
       methods: {
           sendMessage() {
               if (this.chatInput.trim()) {
                   this.websocketService.sendRagflowQuery(this.chatInput, false, null); // Adjust method as needed
                   this.chatMessages.push({ sender: 'You', message: this.chatInput });
                   this.chatInput = '';
               }
           },
           toggleTTS() {
               this.websocketService.toggleTTS(this.useOpenAI);
               console.log(`TTS method set to: ${this.useOpenAI ? 'OpenAI' : 'Sonata'}`);
           },
           receiveMessage(message) {
               this.chatMessages.push({ sender: 'AI', message });
           }
       },
       mounted() {
           this.websocketService = inject('websocketService');
           if (this.websocketService) {
               this.websocketService.on('ragflowAnswer', this.receiveMessage);
           } else {
               console.error('WebSocketService is undefined');
           }
       },
       beforeUnmount() {
           if (this.websocketService) {
               this.websocketService.off('ragflowAnswer', this.receiveMessage);
           }
       }
   });
   </script>